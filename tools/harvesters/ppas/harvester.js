#!/usr/bin/env node

/**
 * PustakaTerbuka - PPAS (Perbadanan Perpustakaan Awam Selangor) Harvester
 * 
 * Harvests catalog records from the PPAS Vega Discover REST API
 * into MARCXML following PustakaTerbuka Harvester Standards and Decision D005 Chunk Lifecycle.
 * 
 * Output: harvest/inbox/ppas/<run-id>-chunk-<xxx>/
 *   - manifest.json
 *   - provenance.jsonl
 *   - records/batch_<n>.xml
 * Session State: harvest/inbox/ppas/<run-id>/partition_state.json
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
export const SOURCE_CODE = 'ppas';
export const SOURCE_NAME = 'Perbadanan Perpustakaan Awam Selangor';
export const SOURCE_BASE_URL = 'https://ppas.ap.iiivega.com/';
export const TERMS_URL = 'https://www.ppas.gov.my/';
export const BASE_API_URL = 'https://ap.iiivega.com/api/search-result/search/format-groups';
export const CUSTOMER_DOMAIN = 'ppas.ap.iiivega.com';
export const USER_AGENT = 'PustakaTerbuka-Harvester/1.0 (+https://github.com/pustaka-terbuka/ppas; contact@pustakaterbuka.org)';
export const HARVESTER_NAME = 'ppas-vega-harvester';
export const HARVESTER_VERSION = '1.0.0';
export const DEFAULT_TOTAL_RECORDS = 200997;
export const DEFAULT_CHUNK_SIZE = 10000;

export function findRepoRoot(startDir) {
  let curr = path.resolve(startDir);
  while (curr !== path.parse(curr).root) {
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return startDir;
}

export function parseArgs(args) {
  const options = {
    maxPages: 0,
    pageSize: 100,
    chunkSize: DEFAULT_CHUNK_SIZE,
    maxRecords: 0,
    query: '*',
    delayMs: 1500,
    mode: 'full',
    outDir: null,
    freshRun: false,
    resumeTarget: 'auto',
    ingestMaster: false,
    skipPipeline: false,
    partitioned: true,
    includeUndated: true,
    sweep: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--sweep') {
      options.mode = 'sweep';
      options.sweep = true;
    } else if (arg === '--max-pages' && i + 1 < args.length) {
      options.maxPages = parseInt(args[++i], 10);
    } else if (arg === '--page-size' && i + 1 < args.length) {
      options.pageSize = parseInt(args[++i], 10);
    } else if (arg === '--chunk-size' && i + 1 < args.length) {
      options.chunkSize = parseInt(args[++i], 10);
    } else if (arg === '--no-chunk') {
      options.chunkSize = 0;
    } else if (arg === '--max-records' && i + 1 < args.length) {
      options.maxRecords = parseInt(args[++i], 10);
    } else if (arg === '--query' && i + 1 < args.length) {
      options.query = args[++i];
    } else if (arg === '--delay' && i + 1 < args.length) {
      options.delayMs = parseInt(args[++i], 10);
    } else if (arg === '--mode' && i + 1 < args.length) {
      options.mode = args[++i];
    } else if (arg === '--out-dir' && i + 1 < args.length) {
      options.outDir = args[++i];
    } else if (arg === '--ingest-master' || arg === '--master-digest') {
      options.ingestMaster = true;
    } else if (arg === '--skip-pipeline' || arg === '--no-pipeline') {
      options.skipPipeline = true;
    } else if (arg === '--fresh' || arg === '--no-resume' || arg === '--new') {
      options.freshRun = true;
      options.resumeTarget = null;
    } else if (arg === '--no-undated') {
      options.includeUndated = false;
    } else if (arg === '--resume') {
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options.resumeTarget = args[++i];
      } else {
        options.resumeTarget = 'auto';
      }
    }
  }

  return options;
}

export function printHelp() {
  console.log(`
PustakaTerbuka PPAS Harvester (Node.js)

Usage:
  node tools/harvesters/ppas/harvester.js [options]

Options:
  --max-pages <num>          Maximum pages to fetch (default: 0 for unlimited)
  --page-size <num>          Records per page, max 100 (default: 100)
  --chunk-size <num>         Records per chunk before pausing/digesting (default: ${DEFAULT_CHUNK_SIZE})
  --no-chunk                 Disable chunk pauses (single monolithic output)
  --max-records <num>        Limit total records saved this run (0 = unconstrained)
  --query <str>              Search query string (default: "*")
  --delay <ms>               Delay between requests in ms (default: 1500)
  --mode <full|incremental>  Harvest mode (default: "full")
  --out-dir <path>           Override output inbox directory
  --master-digest            Automatically validate, merge, and index into Master on each chunk pause
  --skip-pipeline            Skip validate-inbox, merge, and master ingest during chunk pauses
  --fresh, --new             Start a new run without resuming
  --resume [run-id|auto]     Resume latest incomplete run or specify run-id (default: auto)
  -h, --help                 Show this help message
`);
}

export function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/\uFFFD/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchPageWithRetry(query, pageNum, pageSize, extraParams = {}, maxRetries = 5) {
  const body = {
    searchText: query,
    searchType: extraParams.searchType || 'everything',
    pageNum,
    pageSize,
    resourceType: 'FormatGroup'
  };
  if (extraParams.dateFrom != null) body.dateFrom = extraParams.dateFrom;
  if (extraParams.dateTo != null) body.dateTo = extraParams.dateTo;

  const payload = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    'iii-customer-domain': CUSTOMER_DOMAIN,
    'iii-host-domain': CUSTOMER_DOMAIN,
    'api-version': '2',
    'User-Agent': USER_AGENT
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(BASE_API_URL, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(60000)
      });

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;
      if (status === 400 && pageNum >= 100) {
        console.warn(`[WARN] Page ${pageNum} reached OpenSearch max_result_window. Safely capping partition.`);
        return { data: [], totalResults: 10000 };
      }

      let backoffMs = Math.min(300000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 2000);
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed)) backoffMs = parsed * 1000;
      }

      console.warn(`[WARN] HTTP ${status} on page ${pageNum} (attempt ${attempt}/${maxRetries}). Backing off ${Math.round(backoffMs / 1000)}s...`);
      if (attempt === maxRetries) {
        throw new Error(`HTTP ${status}: ${response.statusText}`);
      }
      await sleep(backoffMs);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const backoffMs = Math.min(300000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 2000);
      console.warn(`[WARN] Network error on page ${pageNum} (attempt ${attempt}/${maxRetries}): ${err.message}. Backing off ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }

  throw new Error(`Failed to fetch page ${pageNum} after ${maxRetries} attempts.`);
}

export function validateRecordContent(recordXml) {
  if (!recordXml) return false;
  if (!recordXml.includes('tag="245"')) return false;
  if (!recordXml.includes('tag="001"')) return false;
  return true;
}

export function formatGroupToMarcXml(item) {
  if (!item) return null;

  const identifiers = item.identifiers || {};
  let localId = null;

  // Extract primary local ID
  if (Array.isArray(item.materialTabs) && item.materialTabs.length > 0) {
    const firstTab = item.materialTabs[0];
    if (Array.isArray(firstTab.recordIds) && firstTab.recordIds.length > 0) {
      localId = String(firstTab.recordIds[0]).trim();
    }
  }
  if (!localId && identifiers.local) {
    localId = String(identifiers.local).replace(/^vtls0*/i, '').trim();
  }
  if (!localId && item.id) {
    localId = item.id;
  }
  if (!localId) return null;

  const title = item.title;
  if (!title) return null;

  // Issuance (monograph vs serial)
  let issuanceType = 'm';
  if (Array.isArray(item.materialTabs)) {
    for (const tab of item.materialTabs) {
      if (Array.isArray(tab.issuance) && tab.issuance.includes('serial')) {
        issuanceType = 's';
        break;
      }
    }
  }

  const xmlLines = [];
  xmlLines.push('  <record>');
  xmlLines.push(`    <leader>00000na${issuanceType} a2200000Ia 4500</leader>`);
  xmlLines.push(`    <controlfield tag="001">${escapeXml(localId)}</controlfield>`);
  xmlLines.push('    <controlfield tag="003">PPAS</controlfield>');

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  xmlLines.push(`    <controlfield tag="005">${timestamp}</controlfield>`);

  const lang = (item.language || 'may').toLowerCase().slice(0, 3);
  let pubYear = '    ';
  if (item.publicationDate) {
    const yMatch = String(item.publicationDate).match(/\b(19\d\d|20\d\d)\b/);
    if (yMatch) pubYear = yMatch[1];
  }
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  xmlLines.push(`    <controlfield tag="008">${dateStr}s${pubYear}       my            000 0 ${lang} d</controlfield>`);

  // Language (041 $a)
  xmlLines.push('    <datafield tag="041" ind1=" " ind2=" ">');
  xmlLines.push(`      <subfield code="a">${escapeXml(lang)}</subfield>`);
  xmlLines.push('    </datafield>');

  // Cataloging agency (040)
  xmlLines.push('    <datafield tag="040" ind1=" " ind2=" ">');
  xmlLines.push('      <subfield code="a">PPAS</subfield>');
  xmlLines.push(`      <subfield code="b">${escapeXml(lang)}</subfield>`);
  xmlLines.push('      <subfield code="c">PPAS</subfield>');
  xmlLines.push('      <subfield code="d">PPAS</subfield>');
  xmlLines.push('    </datafield>');

  // Extract from materialTabs
  const isbns = new Set();
  const localIds = new Set();
  const editions = new Set();
  const descriptions = new Set();
  const formats = new Set();
  const urls = new Set();
  const locations = [];
  let callNumber = null;

  if (identifiers.isbn) {
    if (Array.isArray(identifiers.isbn)) identifiers.isbn.forEach(v => isbns.add(String(v).trim()));
    else isbns.add(String(identifiers.isbn).trim());
  }

  if (Array.isArray(item.materialTabs)) {
    for (const tab of item.materialTabs) {
      if (tab.name) formats.add(tab.name.trim());
      if (tab.description) descriptions.add(tab.description.trim());

      if (tab.identifiedBy) {
        if (Array.isArray(tab.identifiedBy.isbn)) tab.identifiedBy.isbn.forEach(v => isbns.add(String(v).trim()));
        if (Array.isArray(tab.identifiedBy.local)) tab.identifiedBy.local.forEach(v => localIds.add(String(v).trim()));
      }

      if (tab.availability && Array.isArray(tab.availability.urls)) {
        tab.availability.urls.forEach(u => urls.add(String(u).trim()));
      }

      if (Array.isArray(tab.locations)) {
        for (const loc of tab.locations) {
          locations.push({
            code: loc.code || '',
            label: loc.label || '',
            availabilityStatus: loc.availabilityStatus || 'Available'
          });
        }
      }

      if (Array.isArray(tab.editions)) {
        for (const ed of tab.editions) {
          if (ed.edition) editions.add(ed.edition.trim());
          if (!callNumber && ed.callNumber) callNumber = ed.callNumber;
        }
      }
    }
  }

  // ISBNs (020)
  for (const isbn of isbns) {
    if (isbn) {
      xmlLines.push('    <datafield tag="020" ind1=" " ind2=" ">');
      xmlLines.push(`      <subfield code="a">${escapeXml(isbn)}</subfield>`);
      xmlLines.push('    </datafield>');
    }
  }

  // System IDs (035)
  xmlLines.push('    <datafield tag="035" ind1=" " ind2=" ">');
  xmlLines.push(`      <subfield code="a">(PPAS)${escapeXml(localId)}</subfield>`);
  xmlLines.push('    </datafield>');
  for (const lid of localIds) {
    if (lid && lid !== localId) {
      xmlLines.push('    <datafield tag="035" ind1=" " ind2=" ">');
      xmlLines.push(`      <subfield code="a">${escapeXml(lid)}</subfield>`);
      xmlLines.push('    </datafield>');
    }
  }

  // Call Numbers (082 & 090)
  if (callNumber) {
    xmlLines.push('    <datafield tag="082" ind1=" " ind2=" ">');
    xmlLines.push(`      <subfield code="a">${escapeXml(callNumber)}</subfield>`);
    xmlLines.push('    </datafield>');
    xmlLines.push('    <datafield tag="090" ind1=" " ind2=" ">');
    xmlLines.push(`      <subfield code="a">${escapeXml(callNumber)}</subfield>`);
    xmlLines.push('    </datafield>');
  }

  // Author (100)
  const author = item.primaryAgent?.label;
  if (author) {
    xmlLines.push('    <datafield tag="100" ind1="1" ind2=" ">');
    xmlLines.push(`      <subfield code="a">${escapeXml(author.replace(/,\s*\/$/, ''))}</subfield>`);
    xmlLines.push('    </datafield>');
  }

  // Title (245)
  xmlLines.push('    <datafield tag="245" ind1="1" ind2="0">');
  xmlLines.push(`      <subfield code="a">${escapeXml(title)}</subfield>`);
  xmlLines.push('    </datafield>');

  // Edition (250)
  for (const ed of editions) {
    if (ed) {
      xmlLines.push('    <datafield tag="250" ind1=" " ind2=" ">');
      xmlLines.push(`      <subfield code="a">${escapeXml(ed)}</subfield>`);
      xmlLines.push('    </datafield>');
    }
  }

  // Publication (264)
  const pubDate = item.publicationDate;
  if (pubDate) {
    xmlLines.push('    <datafield tag="264" ind1=" " ind2="1">');
    xmlLines.push(`      <subfield code="c">${escapeXml(pubDate)}</subfield>`);
    xmlLines.push('    </datafield>');
  }

  // Series (490)
  const series = item.seriesTitle;
  if (series) {
    xmlLines.push('    <datafield tag="490" ind1="0" ind2=" ">');
    xmlLines.push(`      <subfield code="a">${escapeXml(series)}</subfield>`);
    xmlLines.push('    </datafield>');
  }

  // Description (520)
  for (const desc of descriptions) {
    if (desc) {
      xmlLines.push('    <datafield tag="520" ind1=" " ind2=" ">');
      xmlLines.push(`      <subfield code="a">${escapeXml(desc)}</subfield>`);
      xmlLines.push('    </datafield>');
    }
  }

  // Format / Genre (655)
  for (const format of formats) {
    if (format) {
      xmlLines.push('    <datafield tag="655" ind1=" " ind2="7">');
      xmlLines.push(`      <subfield code="a">${escapeXml(format)}</subfield>`);
      xmlLines.push('      <subfield code="2">local</subfield>');
      xmlLines.push('    </datafield>');
    }
  }

  // Holdings & Locations (852 & 952)
  if (callNumber || locations.length > 0) {
    xmlLines.push('    <datafield tag="852" ind1=" " ind2=" ">');
    xmlLines.push('      <subfield code="a">PPAS</subfield>');
    if (callNumber) {
      xmlLines.push(`      <subfield code="h">${escapeXml(callNumber)}</subfield>`);
    }
    for (const loc of locations) {
      if (loc.label) {
        xmlLines.push(`      <subfield code="b">${escapeXml(loc.label)}</subfield>`);
      }
    }
    xmlLines.push('    </datafield>');
  }

  for (const loc of locations) {
    xmlLines.push('    <datafield tag="952" ind1=" " ind2=" ">');
    xmlLines.push(`      <subfield code="a">${escapeXml(loc.code || 'PPAS')}</subfield>`);
    xmlLines.push(`      <subfield code="b">${escapeXml(loc.label)}</subfield>`);
    if (callNumber) {
      xmlLines.push(`      <subfield code="o">${escapeXml(callNumber)}</subfield>`);
    }
    xmlLines.push(`      <subfield code="l">${escapeXml(loc.availabilityStatus)}</subfield>`);
    xmlLines.push('    </datafield>');
  }

  // Cover image / URLs (856)
  if (item.coverUrl && item.coverUrl.medium) {
    xmlLines.push('    <datafield tag="856" ind1="4" ind2="2">');
    xmlLines.push(`      <subfield code="u">${escapeXml(item.coverUrl.medium)}</subfield>`);
    xmlLines.push('      <subfield code="3">Cover Image</subfield>');
    xmlLines.push('    </datafield>');
  }
  for (const u of urls) {
    if (u) {
      xmlLines.push('    <datafield tag="856" ind1="4" ind2="0">');
      xmlLines.push(`      <subfield code="u">${escapeXml(u)}</subfield>`);
      xmlLines.push('    </datafield>');
    }
  }

  // Source attribution (996)
  xmlLines.push('    <datafield tag="996" ind1=" " ind2=" ">');
  xmlLines.push('      <subfield code="a">ppas</subfield>');
  xmlLines.push('    </datafield>');

  xmlLines.push('  </record>');
  return xmlLines.join('\n');
}

export function inspectBatches(recordsDir) {
  const validBatches = new Set();
  let highestPage = -1;
  let recordCount = 0;
  if (!fs.existsSync(recordsDir)) return { validBatches, highestPage, recordCount };

  const files = fs.readdirSync(recordsDir).filter(f => f.startsWith('batch_') && f.endsWith('.xml'));
  for (const file of files) {
    const match = file.match(/^batch_(\d+)\.xml$/);
    if (match) {
      const pNum = parseInt(match[1], 10);
      const filePath = path.join(recordsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      if (content.includes('</collection>')) {
        validBatches.add(file);
        if (pNum > highestPage) highestPage = pNum;
        const matches = content.match(/<record[\s>]/g);
        recordCount += matches ? matches.length : 0;
      } else {
        console.warn(`[REPAIR] Batch ${file} missing closing </collection>. Removing corrupt file.`);
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  }

  return { validBatches, highestPage, recordCount };
}

export function repairProvenance(provPath, validBatches) {
  if (!fs.existsSync(provPath)) return;
  const content = fs.readFileSync(provPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const retained = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.file && validBatches.has(entry.file)) {
        retained.push(line);
      }
    } catch {
      // Discard malformed jsonl lines
    }
  }

  fs.writeFileSync(provPath, retained.length > 0 ? retained.join('\n') + '\n' : '', 'utf8');
}

export function generateSweepPlan() {
  const partitions = [];
  let id = 0;

  // 1. Single character queries (all <= 10,000 records across entire catalog)
  const safeSingle = ['0', '2', '3', '4', '5', '6', '7', '8', '9', 'e', 'f', 'o', 'q', 'u', 'v', 'x', 'y', 'z'];
  for (const c of safeSingle) {
    partitions.push({ id: id++, name: `sweep_single_${c}`, query: `${c}*`, dateFrom: null, dateTo: null });
  }

  // 2. Number 1 prefix breakdown (19 has ~18k, so subdivide)
  for (const c of ['0', '1', '2', '3', '4', '5', '6', '7', '8']) {
    partitions.push({ id: id++, name: `sweep_1_${c}`, query: `1${c}*`, dateFrom: null, dateTo: null });
  }
  for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    partitions.push({ id: id++, name: `sweep_19_${d}`, query: `19${d}*`, dateFrom: null, dateTo: null });
  }

  // 3. Dense letters with two-character breakdown
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  const dense = ['a', 'b', 'c', 'd', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'w'];
  for (const l of dense) {
    for (const a of alphabet) {
      // Skip 'bk' (the format code for books that contains 102k records)
      if (l === 'b' && a === 'k') continue;

      // Subdivide 'co' (> 11k)
      if (l === 'c' && a === 'o') {
        for (const c3 of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
          partitions.push({ id: id++, name: `sweep_co_${c3}`, query: `co${c3}*`, dateFrom: null, dateTo: null });
        }
        continue;
      }

      // Subdivide 'ma' (> 16k)
      if (l === 'm' && a === 'a') {
        for (const m3 of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
          partitions.push({ id: id++, name: `sweep_ma_${m3}`, query: `ma${m3}*`, dateFrom: null, dateTo: null });
        }
        continue;
      }

      partitions.push({ id: id++, name: `sweep_${l}${a}`, query: `${l}${a}*`, dateFrom: null, dateTo: null });
    }
  }

  // 4. Non-Latin Unicode queries (Chinese, Arabic/Jawi, Tamil high frequency)
  const nonLatin = [
    '史', '中', '华', '国', '大', '人', '小', '生', '一', '新', '文', '学', '美', '马', '年',
    '我', '在', '有', '作', '书', '本', '出', '版', '经', '理', '论', '语', '言', '社', '会',
    '家', '现', '代', '世', '界', '心', '灵', '知', '识', '故', '事', '红', '楼', '三', '水',
    '浒', '西', '游', '唐', '宋', '明', '清', '民', '童', '画', '精', '选', '诗', '词', '传',
    'ال', 'كتاب', 'م', 'س', 'د', 'ف', 'ق', 'ب', 'ت', 'ن', 'ي', 'قرآن', 'حديث', 'إسلام',
    'ப', 'த', 'ம', 'க', 'ச', 'வ', 'அ', 'இ', 'உ', 'எ'
  ];
  for (const nl of nonLatin) {
    partitions.push({ id: id++, name: `sweep_nl_${encodeURIComponent(nl)}`, query: `${nl}*`, dateFrom: null, dateTo: null });
  }

  return partitions;
}

export function generatePartitionPlan(options = {}) {
  if (options.sweep || options.mode === 'sweep') {
    return generateSweepPlan();
  }

  const partitions = [];
  let id = 0;

  // 1. Mature modern catalog years (2026 down to 1980) - all <= 7,000 records
  for (let y = 2026; y >= 1980; y--) {
    partitions.push({ id: id++, name: `year_${y}`, query: '*', dateFrom: y, dateTo: y });
  }

  // 2. Mid-century decade blocks
  partitions.push({ id: id++, name: 'era_1970_1979', query: '*', dateFrom: 1970, dateTo: 1979 });
  partitions.push({ id: id++, name: 'era_1960_1969', query: '*', dateFrom: 1960, dateTo: 1969 });
  partitions.push({ id: id++, name: 'era_1950_1959', query: '*', dateFrom: 1950, dateTo: 1959 });

  // 3. Historical eras
  partitions.push({ id: id++, name: 'era_1900_1949', query: '*', dateFrom: 1900, dateTo: 1949 });
  partitions.push({ id: id++, name: 'era_1800_1899', query: '*', dateFrom: 1800, dateTo: 1899 });
  partitions.push({ id: id++, name: 'era_1000_1799', query: '*', dateFrom: 1000, dateTo: 1799 });
  partitions.push({ id: id++, name: 'era_1_999', query: '*', dateFrom: 1, dateTo: 999 });

  // 4. Future accession dates
  partitions.push({ id: id++, name: 'era_2027_2050', query: '*', dateFrom: 2027, dateTo: 2050 });

  // 5. Undated / Legacy VTLS records (date 9999) partitioned by character
  if (options.includeUndated !== false) {
    const singleChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'c', 'e', 'f', 'g', 'i', 'k', 'l', 'n', 'o', 'p', 'q', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
    for (const c of singleChars) {
      partitions.push({ id: id++, name: `undated_9999_${c}`, query: `${c}*`, dateFrom: 9999, dateTo: 9999 });
    }

    const denseLetters = ['a', 'b', 'd', 'h', 'j', 'm', 'r', 's'];
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
    for (const dl of denseLetters) {
      for (const a of alphabet) {
        partitions.push({ id: id++, name: `undated_9999_${dl}${a}`, query: `${dl}${a}*`, dateFrom: 9999, dateTo: 9999 });
      }
    }
  }

  return partitions;
}

export async function processChunkPipeline(repoRoot, chunkDir, options) {
  if (options.skipPipeline) return;

  console.log(`\n-------------------------------------------------------`);
  console.log(`[PIPELINE] Executing automated ingestion for: ${path.basename(chunkDir)}`);
  console.log(`-------------------------------------------------------`);

  try {
    // 1. Validate inbox
    console.log(`[PIPELINE 1/3] Validating inbox schema and records...`);
    execSync(`node tools/validate-inbox.js "${chunkDir}"`, {
      cwd: repoRoot,
      stdio: 'inherit'
    });

    // 2. Merge into local institutional catalog
    console.log(`[PIPELINE 2/3] Merging validated records into local data shards...`);
    execSync(`node tools/merge.js "${chunkDir}"`, {
      cwd: repoRoot,
      stdio: 'inherit'
    });

    // 3. Sequential Master Digest Ingestion if requested
    if (options.ingestMaster) {
      console.log(`[PIPELINE 3/3] Ingesting to Master Hub catalog...`);
      execSync(`node tools/ingest-to-master.js --provider ppas`, {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    }

    console.log(`[PIPELINE SUCCESS] Chunk successfully integrated!\n`);
  } catch (err) {
    console.error(`[PIPELINE ERROR] Chunk processing failed: ${err.message}`);
    throw err;
  }
}

export async function runHarvest(cliArgs = process.argv.slice(2)) {
  const options = parseArgs(cliArgs);
  if (options.help) {
    printHelp();
    return 0;
  }

  const repoRoot = findRepoRoot(__dirname);
  const defaultBaseDir = path.join(repoRoot, 'harvest', 'inbox', SOURCE_CODE);
  const now = new Date();
  const startedAt = now.toISOString();

  // Setup run directory and chunk management
  const pad = (n) => String(n).padStart(2, '0');
  let runId = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  if (options.sweep) {
    runId += '-sweep';
  }
  let sessionDir = path.join(defaultBaseDir, runId);
  let chunkIndex = 1;
  let recordsInChunk = 0;
  let currentPartitionIdx = 0;
  let currentPage = 0;
  let totalSaved = 0;
  let errorCount = 0;

  // Session state resumption check
  if (!options.freshRun) {
    let candidateRuns = fs.existsSync(defaultBaseDir)
      ? fs.readdirSync(defaultBaseDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.includes('-chunk-'))
          .map(d => d.name)
          .sort()
          .reverse()
      : [];

    if (options.sweep) {
      candidateRuns = candidateRuns.filter(r => r.endsWith('-sweep'));
    }

    let targetRun = null;
    if (options.resumeTarget && options.resumeTarget !== 'auto') {
      targetRun = options.resumeTarget;
    } else if (candidateRuns.length > 0) {
      targetRun = candidateRuns[0];
    }

    if (targetRun) {
      const stateFile = path.join(defaultBaseDir, targetRun, 'partition_state.json');
      if (fs.existsSync(stateFile)) {
        try {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          runId = targetRun;
          sessionDir = path.join(defaultBaseDir, runId);
          currentPartitionIdx = state.currentPartitionIdx || 0;
          currentPage = state.currentPage || 0;
          chunkIndex = state.chunkIndex || 1;
          recordsInChunk = state.recordsInChunk || 0;
          totalSaved = state.totalSaved || 0;
          console.log(`[RESUME] Resuming run '${runId}' at partition ${currentPartitionIdx}, page ${currentPage}, chunk ${chunkIndex} (${totalSaved} records already saved).`);
        } catch (e) {
          console.warn(`[WARN] Failed to parse session state: ${e.message}. Starting fresh.`);
        }
      }
    }
  }

  fs.mkdirSync(sessionDir, { recursive: true });

  const getChunkDir = (idx) => {
    if (options.chunkSize === 0) {
      return path.join(defaultBaseDir, runId);
    }
    const pad = String(idx).padStart(3, '0');
    return path.join(defaultBaseDir, `${runId}-chunk-${pad}`);
  };

  let currentChunkDir = getChunkDir(chunkIndex);
  let recordsDir = path.join(currentChunkDir, 'records');
  let provPath = path.join(currentChunkDir, 'provenance.jsonl');
  fs.mkdirSync(recordsDir, { recursive: true });
  let batchNumberInChunk = fs.existsSync(recordsDir)
    ? fs.readdirSync(recordsDir).filter(f => f.endsWith('.xml')).length
    : 0;

  const partitions = generatePartitionPlan(options);
  console.log(`=======================================================`);
  console.log(` PustakaTerbuka PPAS Harvester`);
  console.log(` Source: ${SOURCE_NAME} (${SOURCE_CODE})`);
  console.log(` Base API: ${BASE_API_URL}`);
  console.log(` Total Partitions: ${partitions.length}`);
  console.log(` Chunk Size: ${options.chunkSize > 0 ? options.chunkSize : 'Disabled'}`);
  console.log(` Output: ${currentChunkDir}`);
  console.log(`=======================================================\n`);

  const saveSessionState = () => {
    const stateFile = path.join(sessionDir, 'partition_state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      runId,
      currentPartitionIdx,
      currentPage,
      chunkIndex,
      recordsInChunk,
      totalSaved,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  };

  const finalizeChunkManifest = (status = 'complete') => {
    const manifestPath = path.join(currentChunkDir, 'manifest.json');
    const manifest = {
      schema_version: '1.0',
      source_code: SOURCE_CODE,
      source_name: SOURCE_NAME,
      source_base_url: SOURCE_BASE_URL,
      terms_url: TERMS_URL,
      terms_verified_on: '2026-10-12',
      harvester_name: HARVESTER_NAME,
      harvester_version: HARVESTER_VERSION,
      run_id: path.basename(currentChunkDir),
      mode: options.mode,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      record_count: recordsInChunk,
      error_count: errorCount,
      status: status,
      user_agent: USER_AGENT
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  };

  let halted = false;
  let initialResumedPartition = currentPartitionIdx;

  for (let pIdx = currentPartitionIdx; pIdx < partitions.length; pIdx++) {
    if (halted) break;
    currentPartitionIdx = pIdx;
    const part = partitions[pIdx];
    console.log(`\n[PARTITION ${pIdx + 1}/${partitions.length}] ${part.name} (Year: ${part.dateFrom || 'all'}, Query: "${part.query}")`);

    let pageNum = (pIdx === initialResumedPartition) ? currentPage : 0;
    let partitionTotal = null;

    while (true) {
      if (options.maxRecords > 0 && totalSaved >= options.maxRecords) {
        console.log(`[LIMIT] Reached max-records limit (${options.maxRecords}). Stopping.`);
        halted = true;
        break;
      }
      if (options.maxPages > 0 && pageNum >= options.maxPages) {
        console.log(`[LIMIT] Reached max-pages limit for partition.`);
        break;
      }

      console.log(`[FETCH] ${part.name} -> Page ${pageNum} (pageSize: ${options.pageSize})...`);
      let result;
      try {
        result = await fetchPageWithRetry(part.query, pageNum, options.pageSize, {
          dateFrom: part.dateFrom,
          dateTo: part.dateTo
        });
      } catch (err) {
        console.error(`[FATAL] Failed to fetch partition ${part.name} page ${pageNum}: ${err.message}`);
        errorCount++;
        break;
      }

      if (partitionTotal === null && result.totalResults != null) {
        partitionTotal = result.totalResults;
        console.log(`[INFO] Partition ${part.name} has ${partitionTotal} records.`);
      }

      const items = result.data || [];
      if (items.length === 0) {
        console.log(`[DONE] Partition ${part.name} complete (0 records returned on page ${pageNum}).`);
        break;
      }

      // Convert items to MARCXML
      const xmlRecords = [];
      const provEntries = [];

      for (let i = 0; i < items.length; i++) {
        if (options.maxRecords > 0 && totalSaved >= options.maxRecords) break;
        const item = items[i];
        const recordXml = formatGroupToMarcXml(item);
        if (recordXml && validateRecordContent(recordXml)) {
          xmlRecords.push(recordXml);

          const localIdMatch = recordXml.match(/<controlfield tag="001">([^<]+)<\/controlfield>/);
          const localId = localIdMatch ? localIdMatch[1] : item.id;
          const batchFileName = `batch_${batchNumberInChunk}.xml`;

          provEntries.push(JSON.stringify({
            source_001: localId,
            source_url: `${SOURCE_BASE_URL}search/card?id=${encodeURIComponent(item.id)}`,
            harvested_at: new Date().toISOString(),
            file: batchFileName,
            index: xmlRecords.length - 1
          }));

          totalSaved++;
          recordsInChunk++;
        }
      }

      if (xmlRecords.length > 0) {
        const batchFile = path.join(recordsDir, `batch_${batchNumberInChunk}.xml`);
        const xmlContent = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<collection xmlns="http://www.loc.gov/MARC21/slim">',
          xmlRecords.join('\n'),
          '</collection>',
          ''
        ].join('\n');

        fs.writeFileSync(batchFile, xmlContent, 'utf8');
        fs.appendFileSync(provPath, provEntries.join('\n') + '\n', 'utf8');
        console.log(`[SAVED] ${batchFile} (${xmlRecords.length} records, totalSaved: ${totalSaved}, chunkRecords: ${recordsInChunk}).`);
        batchNumberInChunk++;
      }

      pageNum++;
      currentPage = pageNum;
      saveSessionState();

      // Check chunk boundary
      if (options.chunkSize > 0 && recordsInChunk >= options.chunkSize) {
        console.log(`\n=======================================================`);
        console.log(`[CHUNK COMPLETE] Chunk ${chunkIndex} reached ${recordsInChunk} records!`);
        console.log(`=======================================================`);

        finalizeChunkManifest('complete');
        await processChunkPipeline(repoRoot, currentChunkDir, options);

        // Open next chunk
        chunkIndex++;
        recordsInChunk = 0;
        batchNumberInChunk = 0;
        currentChunkDir = getChunkDir(chunkIndex);
        recordsDir = path.join(currentChunkDir, 'records');
        provPath = path.join(currentChunkDir, 'provenance.jsonl');
        fs.mkdirSync(recordsDir, { recursive: true });
        saveSessionState();
      }

      if (items.length < options.pageSize) {
        console.log(`[DONE] Reached end of partition ${part.name} (last page had ${items.length} records).`);
        break;
      }

      if (options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    }

    currentPage = 0;
    saveSessionState();
  }

  // Finalize current chunk if has records
  if (recordsInChunk > 0) {
    finalizeChunkManifest('complete');
    await processChunkPipeline(repoRoot, currentChunkDir, options);
  }

  saveSessionState();

  console.log(`\n=======================================================`);
  console.log(` PPAS Harvest Run Completed!`);
  console.log(` Run ID: ${runId}`);
  console.log(` Total Records Harvested: ${totalSaved}`);
  console.log(` Total Errors: ${errorCount}`);
  console.log(` Finished: ${new Date().toISOString()}`);
  console.log(`=======================================================`);

  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runHarvest().catch(err => {
    console.error(`[FATAL] Harvester execution failed:`, err);
    process.exit(1);
  });
}
