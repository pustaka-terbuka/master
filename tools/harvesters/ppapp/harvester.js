#!/usr/bin/env node

/**
 * PustakaTerbuka - PPAPP (Perbadanan Perpustakaan Awam Pulau Pinang) Harvester
 * 
 * Harvests catalog records from the PPAPP Koha OPAC into MARCXML
 * following PustakaTerbuka Harvester Standards and Decision D005 Chunk Lifecycle.
 * 
 * Normative Spec: master/docs/HARVESTER_DEVELOPER_GUIDE.md & docs/HARVESTER_CHUNK_LIFECYCLE.md
 * Output: harvest/inbox/ppapp/<run-id>-chunk-<xxx>/
 *   - manifest.json
 *   - provenance.jsonl
 *   - records/batch_<n>.xml
 * Session State: harvest/inbox/ppapp/<run-id>/partition_state.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
export const SOURCE_CODE = 'ppapp';
export const SOURCE_NAME = 'Perbadanan Perpustakaan Awam Pulau Pinang';
export const SOURCE_BASE_URL = 'https://opac.penanglib.gov.my/';
export const TERMS_URL = 'https://www.penanglib.gov.my/';
export const BASE_EXPORT_URL = 'https://opac.penanglib.gov.my/cgi-bin/koha/opac-export.pl';
export const BASE_DETAIL_URL = 'https://opac.penanglib.gov.my/cgi-bin/koha/opac-detail.pl';
export const USER_AGENT = 'PustakaTerbuka-Harvester/1.0 (+https://github.com/pustaka-terbuka/ppapp; contact@pustakaterbuka.org)';
export const HARVESTER_NAME = 'ppapp-koha-harvester';
export const HARVESTER_VERSION = '1.1.0';
export const DEFAULT_MAX_BIB = 351871;
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
    startBib: 1,
    endBib: DEFAULT_MAX_BIB,
    batchSize: 100,
    delayMs: 2000,
    chunkSize: DEFAULT_CHUNK_SIZE,
    maxRecords: 0,
    maxConsecutiveMisses: 100,
    mode: 'full',
    outDir: null,
    freshRun: false,
    resumeTarget: 'auto',
    ingestMaster: false,
    skipPipeline: false,
    useSitemap: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--start-bib' && i + 1 < args.length) {
      options.startBib = parseInt(args[++i], 10);
    } else if (arg === '--end-bib' && i + 1 < args.length) {
      options.endBib = parseInt(args[++i], 10);
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      options.batchSize = parseInt(args[++i], 10);
    } else if (arg === '--delay' && i + 1 < args.length) {
      options.delayMs = parseInt(args[++i], 10);
    } else if (arg === '--chunk-size' && i + 1 < args.length) {
      options.chunkSize = parseInt(args[++i], 10);
    } else if (arg === '--no-chunk') {
      options.chunkSize = 0;
    } else if (arg === '--max-records' && i + 1 < args.length) {
      options.maxRecords = parseInt(args[++i], 10);
    } else if (arg === '--mode' && i + 1 < args.length) {
      options.mode = args[++i];
    } else if (arg === '--out-dir' && i + 1 < args.length) {
      options.outDir = args[++i];
    } else if (arg === '--ingest-master' || arg === '--master-digest') {
      options.ingestMaster = true;
    } else if (arg === '--skip-pipeline') {
      options.skipPipeline = true;
    } else if (arg === '--sitemap' || arg === '--use-sitemap') {
      options.useSitemap = true;
    } else if (arg === '--fresh' || arg === '--no-resume' || arg === '--new') {
      options.freshRun = true;
      options.resumeTarget = null;
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
PustakaTerbuka PPAPP Harvester (Node.js)

Usage:
  node tools/harvesters/ppapp/harvester.js [options]

Options:
  --start-bib <num>          First biblionumber to harvest (default: 1)
  --end-bib <num>            Last biblionumber to harvest (default: ${DEFAULT_MAX_BIB})
  --batch-size <num>         Records per XML file (default: 100)
  --delay <ms>               Delay between requests in ms (default: 2000)
  --chunk-size <num>         Records per harvest chunk for master digest (default: ${DEFAULT_CHUNK_SIZE})
  --no-chunk                 Disable chunk pauses (single monolithic output)
  --master-digest            Automatically validate, merge, and index into Master on each 10k pause
  --sitemap                  Use PPAPP OPAC sitemap index for exact biblionumber discovery
  --max-records <num>        Limit total records saved this run (0 = unconstrained)
  --mode <full|incremental>  Harvest mode (default: "full")
  --out-dir <path>           Override output directory
  --resume [run-id|auto]     Resume latest incomplete run or specify run-id (default: auto)
  --fresh, --new             Start a new run without resuming
  --skip-pipeline            Skip validate-inbox, merge, and master ingest during chunk pauses
  -h, --help                 Show this help message
`);
}

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch MARCXML record for a specific biblionumber from Koha opac-export.pl
 */
export async function fetchRecordMarcXml(bibNumber, options = {}, maxRetries = 5) {
  const url = `${BASE_EXPORT_URL}?op=export&bib=${bibNumber}&format=marcxml`;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/xml, text/xml, */*'
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual', // Do not automatically follow 302 to 404 page
        signal: AbortSignal.timeout(30000)
      });

      // Status 302 or 404 indicates record does not exist
      if (response.status === 302 || response.status === 404) {
        return null;
      }

      if (response.ok) {
        const text = await response.text();
        if (text && text.includes('<record') && text.includes('</record>')) {
          // Extract the <record>...</record> content
          const match = text.match(/<record[\s\S]*?<\/record>/);
          if (match) {
            let recordStr = match[0];
            // Ensure 996 sourceCode tag exists for downstream mergers
            if (!recordStr.includes('tag="996"')) {
              recordStr = recordStr.replace(
                '</record>',
                '  <datafield tag="996" ind1=" " ind2=" ">\n    <subfield code="a">ppapp</subfield>\n  </datafield>\n</record>'
              );
            }
            return recordStr;
          }
        }
        return null;
      }

      // Handle backoff on rate limits or server errors
      let backoffMs = Math.min(300000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 2000);
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed)) backoffMs = parsed * 1000;
      }

      console.warn(`[WARN] HTTP ${response.status} on bib ${bibNumber} (attempt ${attempt}/${maxRetries}). Backing off ${Math.round(backoffMs / 1000)}s...`);
      if (attempt === maxRetries) {
        console.error(`[ERROR] Skipping bib ${bibNumber} after HTTP ${response.status} max retries.`);
        return null;
      }
      await sleep(backoffMs);
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[ERROR] Network failure on bib ${bibNumber} after ${maxRetries} attempts: ${err.message}. Skipping bib.`);
        return null;
      }
      const backoffMs = Math.min(300000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 2000);
      console.warn(`[WARN] Network error on bib ${bibNumber} (attempt ${attempt}/${maxRetries}): ${err.message}. Backing off ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }

  return null;
}

export function validateRecordContent(recordXml) {
  if (!recordXml) return false;
  // Must contain non-empty title (245)
  if (!recordXml.includes('tag="245"')) return false;
  // Must contain control number 001
  if (!recordXml.includes('tag="001"')) return false;
  return true;
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
        const count = (content.match(/<record[\s>]/g) || []).length;
        recordCount += count;
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
  const cleanLines = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.file && validBatches.has(obj.file)) {
        cleanLines.push(line);
      }
    } catch {}
  }

  if (cleanLines.length !== lines.length) {
    console.warn(`[REPAIR] Scrubbed ${lines.length - cleanLines.length} orphan entries from provenance.jsonl.`);
    fs.writeFileSync(provPath, cleanLines.join('\n') + (cleanLines.length > 0 ? '\n' : ''), 'utf8');
  }
}

export function findLatestIncompleteRun(baseDir) {
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  for (const name of entries) {
    const fullPath = path.join(baseDir, name);
    const manifestPath = path.join(fullPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      if (fs.existsSync(path.join(fullPath, 'records'))) return fullPath;
    } else {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.status !== 'complete') return fullPath;
      } catch {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Fetch all valid biblionumbers from the Koha OPAC sitemaps
 */
export async function fetchSitemapBibs(cacheFile = null) {
  if (cacheFile && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`[SITEMAP] Loaded ${cached.length} catalog biblionumbers from cache: ${cacheFile}`);
        return cached;
      }
    } catch (_) {}
  }

  console.log(`[SITEMAP] Discovering catalog entries via sitemap index: ${SOURCE_BASE_URL}sitemapindex.xml...`);
  const bibSet = new Set();
  for (let i = 1; i <= 7; i++) {
    const sId = String(i).padStart(4, '0');
    const url = `${SOURCE_BASE_URL}sitemap${sId}.xml`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) {
        const text = await res.text();
        const matches = text.matchAll(/<loc>.*?\/bib\/(\d+)<\/loc>/g);
        let count = 0;
        for (const m of matches) {
          bibSet.add(parseInt(m[1], 10));
          count++;
        }
        console.log(`[SITEMAP] sitemap${sId}.xml: discovered ${count} records.`);
      }
    } catch (e) {
      console.warn(`[WARN] Could not fetch sitemap${sId}.xml: ${e.message}`);
    }
  }
  const sortedBibs = Array.from(bibSet).sort((a, b) => a - b);
  console.log(`[SITEMAP] Total unique catalog biblionumbers discovered: ${sortedBibs.length}`);
  if (cacheFile && sortedBibs.length > 0) {
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(sortedBibs), 'utf8');
    } catch (_) {}
  }
  return sortedBibs;
}

export async function runHarvest(userOptions = {}) {
  const options = { ...parseArgs(process.argv.slice(2)), ...userOptions };
  if (options.help) {
    printHelp();
    return 0;
  }

  const repoRoot = findRepoRoot(__dirname);
  const inboxBaseDir = options.outDir
    ? path.resolve(options.outDir)
    : path.join(repoRoot, 'harvest', 'inbox', SOURCE_CODE);

  fs.mkdirSync(inboxBaseDir, { recursive: true });

  // Determine run ID & session resumption
  let runId = null;
  let isResumed = false;
  let sessionDir = null;

  if (!options.freshRun && options.resumeTarget) {
    if (options.resumeTarget === 'auto') {
      const latest = findLatestIncompleteRun(inboxBaseDir);
      if (latest) {
        sessionDir = latest;
        runId = path.basename(latest).replace(/-chunk-\d+$/, '');
        isResumed = true;
      }
    } else {
      const targetDir = path.isAbsolute(options.resumeTarget)
        ? options.resumeTarget
        : path.join(inboxBaseDir, options.resumeTarget);
      if (fs.existsSync(targetDir)) {
        sessionDir = targetDir;
        runId = path.basename(targetDir).replace(/-chunk-\d+$/, '');
        isResumed = true;
      }
    }
  }

  if (!isResumed) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    runId = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  }

  const sessionStateDir = path.join(inboxBaseDir, runId);
  fs.mkdirSync(sessionStateDir, { recursive: true });
  const partitionStateFile = path.join(sessionStateDir, 'partition_state.json');

  let partitionState = {
    lastBibNumber: options.startBib - 1,
    currentChunkIndex: 1,
    completedChunks: [],
    totalRecordsSaved: 0
  };

  if (fs.existsSync(partitionStateFile)) {
    try {
      partitionState = { ...partitionState, ...JSON.parse(fs.readFileSync(partitionStateFile, 'utf8')) };
    } catch {}
  }

  function savePartitionState() {
    try {
      fs.writeFileSync(partitionStateFile, JSON.stringify(partitionState, null, 2), 'utf8');
    } catch {}
  }

  let chunkIndex = partitionState.currentChunkIndex || 1;
  let chunkRecordsSaved = 0;
  let chunkErrorCount = 0;
  let batchNumberInChunk = 0;

  function setupChunk(idx) {
    const chunkSuffix = String(idx).padStart(3, '0');
    const cRunId = options.chunkSize > 0 ? `${runId}-chunk-${chunkSuffix}` : runId;
    const cDir = path.join(inboxBaseDir, cRunId);
    const recDir = path.join(cDir, 'records');
    fs.mkdirSync(recDir, { recursive: true });
    const pFile = path.join(cDir, 'provenance.jsonl');
    return { chunkRunId: cRunId, chunkDir: cDir, recordsDir: recDir, provFile: pFile };
  }

  let activeChunk = setupChunk(chunkIndex);

  // Resume inspection for active chunk
  if (isResumed && fs.existsSync(activeChunk.recordsDir)) {
    const inspected = inspectBatches(activeChunk.recordsDir);
    repairProvenance(activeChunk.provFile, inspected.validBatches);
    batchNumberInChunk = inspected.highestPage + 1;
    chunkRecordsSaved = inspected.recordCount;
  }

  const startedAt = new Date().toISOString();
  let chunkStartedAt = startedAt;

  console.log(`=======================================================`);
  console.log(` PustakaTerbuka PPAPP Koha Harvester`);
  console.log(` Run ID:        ${runId} ${isResumed ? '[RESUMED]' : '[NEW]'}`);
  console.log(` Active Chunk:  ${activeChunk.chunkRunId} (Chunk #${chunkIndex})`);
  console.log(` Chunk Size:    ${options.chunkSize > 0 ? options.chunkSize : 'Disabled (Monolithic)'}`);
  console.log(` Master Digest: ${options.ingestMaster ? 'Enabled (Automatic sequential ingestion & Pagefind indexing)' : 'Disabled'}`);
  console.log(` Output Base:   ${inboxBaseDir}`);
  console.log(` Bib Range:     ${options.startBib} -> ${options.endBib}`);
  console.log(` Discovery:     ${options.useSitemap ? 'Sitemap Index' : 'Sequential Incremental'}`);
  console.log(` Politeness:    ${options.delayMs} ms delay between requests`);
  console.log(`=======================================================\n`);

  let totalSaved = partitionState.totalRecordsSaved || 0;
  let batchBuffer = [];
  let harvestStatus = 'complete';
  let failureReason = null;

  function flushBatch() {
    if (batchBuffer.length === 0) return;
    const xmlLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<collection xmlns="http://www.loc.gov/MARC21/slim">'
    ];

    const provLines = [];
    let idx = 0;
    for (const item of batchBuffer) {
      xmlLines.push(item.xml);
      const prov = {
        source_001: String(item.bib),
        source_url: `${BASE_DETAIL_URL}?biblionumber=${item.bib}`,
        harvested_at: item.timestamp,
        file: `batch_${batchNumberInChunk}.xml`,
        index: idx
      };
      provLines.push(JSON.stringify(prov));
      idx++;
    }

    xmlLines.push('</collection>');
    const xmlPath = path.join(activeChunk.recordsDir, `batch_${batchNumberInChunk}.xml`);
    fs.writeFileSync(xmlPath, xmlLines.join('\n'), { encoding: 'utf8' });
    fs.appendFileSync(activeChunk.provFile, provLines.join('\n') + '\n', { encoding: 'utf8' });

    chunkRecordsSaved += batchBuffer.length;
    totalSaved += batchBuffer.length;
    console.log(`[SAVE] Wrote ${batchBuffer.length} records to ${activeChunk.chunkRunId}/batch_${batchNumberInChunk}.xml (Chunk: ${chunkRecordsSaved}/${options.chunkSize > 0 ? options.chunkSize : 'all'} | Total: ${totalSaved})`);

    batchNumberInChunk++;
    batchBuffer = [];

    partitionState.totalRecordsSaved = totalSaved;
    savePartitionState();
  }

  async function pauseAndProcessChunk(isFinal = false, status = 'complete') {
    flushBatch();
    if (chunkRecordsSaved === 0) return;

    console.log(`\n========================================================`);
    console.log(`[CHUNK ${isFinal ? 'FINAL' : 'PAUSE'}] Chunk ${chunkIndex} reached ${chunkRecordsSaved} records.`);
    console.log(` Pausing harvest for chunk sealing, local merge, and master digest...`);
    console.log(`========================================================\n`);

    // 1. Seal manifest in chunk directory
    const termsVerifiedOn = new Date().toISOString().slice(0, 10);
    const manifest = {
      schema_version: '1.0',
      source_code: SOURCE_CODE,
      source_name: SOURCE_NAME,
      source_base_url: SOURCE_BASE_URL,
      terms_url: TERMS_URL,
      terms_verified_on: termsVerifiedOn,
      harvester_name: HARVESTER_NAME,
      harvester_version: HARVESTER_VERSION,
      run_id: activeChunk.chunkRunId,
      mode: options.mode,
      started_at: chunkStartedAt,
      finished_at: new Date().toISOString(),
      record_count: chunkRecordsSaved,
      error_count: chunkErrorCount,
      status: status,
      user_agent: USER_AGENT,
      notes: failureReason
        ? `Chunk ${chunkIndex} ended with status '${status}': ${failureReason}`
        : `PPAPP harvest chunk ${chunkIndex} completed successfully. Total: ${chunkRecordsSaved} records.`
    };

    const manifestPath = path.join(activeChunk.chunkDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[MANIFEST SEALED] Chunk ${chunkIndex} manifest written to ${manifestPath}`);

    // 2. Pipeline execution (validate-inbox -> merge -> ingest:master)
    const isInsideRepo = fs.existsSync(path.join(repoRoot, 'package.json'));
    if (status === 'complete' && isInsideRepo && !options.skipPipeline) {
      console.log(`\n========================================================`);
      console.log(` Running Pipeline for Chunk ${chunkIndex} (${activeChunk.chunkRunId}) `);
      console.log(`========================================================`);

      const { execSync } = await import('child_process');
      try {
        console.log(`\n[Step 1/3] Validating inbox chunk: ${activeChunk.chunkRunId}...`);
        const validateFlags = '--allow-partial --skip-drop-gate';
        execSync(`npm run validate-inbox -- "${activeChunk.chunkDir}" ${validateFlags}`, { cwd: repoRoot, stdio: 'inherit' });

        console.log(`\n[Step 2/3] Merging & deduplicating records into PPAPP catalog...`);
        execSync(`npm run merge -- "${activeChunk.chunkDir}"`, { cwd: repoRoot, stdio: 'inherit' });

        if (options.ingestMaster) {
          console.log(`\n[Step 3/3] Master Digest: Ingesting into PustakaTerbuka Master & building Pagefind search index...`);
          execSync(`npm run ingest:master`, { cwd: repoRoot, stdio: 'inherit' });
          console.log(`\n[MASTER DIGEST] Master catalog successfully indexed and searchable for Chunk ${chunkIndex}!`);
        }
      } catch (err) {
        console.error(`\n[ERROR] Pipeline step failed for chunk ${chunkIndex}: ${err.message}`);
        throw err;
      }
    }

    // 3. Update session state
    if (!partitionState.completedChunks.includes(chunkIndex)) {
      partitionState.completedChunks.push(chunkIndex);
    }
    partitionState.totalRecordsSaved = totalSaved;
    partitionState.currentChunkIndex = chunkIndex + 1;
    savePartitionState();

    // 4. Open next chunk if not final
    if (!isFinal) {
      chunkIndex++;
      chunkRecordsSaved = 0;
      chunkErrorCount = 0;
      batchNumberInChunk = 0;
      chunkStartedAt = new Date().toISOString();
      activeChunk = setupChunk(chunkIndex);

      console.log(`\n========================================================`);
      console.log(` [RESUME] Opened Chunk ${chunkIndex} (${activeChunk.chunkRunId})`);
      console.log(` Resuming harvest loop...`);
      console.log(`========================================================\n`);
    }
  }

  // Graceful shutdown handling
  let isShuttingDown = false;
  const onSignal = async (sig) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[SIGNAL] Received ${sig}. Gracefully flushing buffers and checkpointing chunk state...`);
    harvestStatus = totalSaved > 0 ? 'partial' : 'failed';
    failureReason = `Interrupted by ${sig}`;
    try {
      await pauseAndProcessChunk(true, harvestStatus);
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  try {
    let savedThisRun = 0;
    let targetBibs = [];

    if (options.useSitemap) {
      const sitemapCacheFile = path.join(inboxBaseDir, 'sitemap_cache.json');
      const allSitemapBibs = await fetchSitemapBibs(sitemapCacheFile);
      targetBibs = allSitemapBibs.filter(b => b >= options.startBib && b <= options.endBib);
    }

    let bibIndex = 0;
    let currentBib = Math.max(options.startBib, (partitionState.lastBibNumber || 0) + 1);

    if (options.useSitemap) {
      // Find starting index in targetBibs
      while (bibIndex < targetBibs.length && targetBibs[bibIndex] < currentBib) {
        bibIndex++;
      }
    }

    console.log(`[INFO] Starting harvest loop at biblionumber ${currentBib}...`);

    while (true) {
      if (options.useSitemap) {
        if (bibIndex >= targetBibs.length) break;
        currentBib = targetBibs[bibIndex];
      } else {
        if (currentBib > options.endBib) break;
      }

      if (options.maxRecords > 0 && savedThisRun >= options.maxRecords) {
        console.log(`\n[INFO] Reached requested max records limit (${options.maxRecords}). Stopping.`);
        break;
      }

      const recordXml = await fetchRecordMarcXml(currentBib, options);

      if (recordXml) {
        if (validateRecordContent(recordXml)) {
          batchBuffer.push({
            bib: currentBib,
            xml: recordXml,
            timestamp: new Date().toISOString()
          });
          savedThisRun++;

          if (batchBuffer.length >= options.batchSize) {
            flushBatch();
          }

          // Check if chunk threshold reached
          if (options.chunkSize > 0 && chunkRecordsSaved + batchBuffer.length >= options.chunkSize) {
            await pauseAndProcessChunk(false, 'complete');
          }
        } else {
          console.warn(`[WARN] Bib ${currentBib} failed validation (missing 245 title or 001). Skipping.`);
          chunkErrorCount++;
        }
      }

      partitionState.lastBibNumber = currentBib;

      if (options.useSitemap) {
        bibIndex++;
      } else {
        currentBib++;
      }

      const hasMore = options.useSitemap ? (bibIndex < targetBibs.length) : (currentBib <= options.endBib);
      if (hasMore && (options.maxRecords <= 0 || savedThisRun < options.maxRecords)) {
        await sleep(options.delayMs);
      }
    }

    // Flush & seal final chunk
    await pauseAndProcessChunk(true, 'complete');

  } catch (err) {
    console.error(`\n[ERROR] Harvest interrupted: ${err.message}`);
    failureReason = err.message;
    harvestStatus = totalSaved > 0 ? 'partial' : 'failed';
    try {
      await pauseAndProcessChunk(true, harvestStatus);
    } catch {}
  } finally {
    savePartitionState();
    console.log(`\n=======================================================`);
    console.log(` PPAPP Harvest Run Finished`);
    console.log(` Final Status: ${harvestStatus}`);
    console.log(` Total Saved:  ${totalSaved} records across ${partitionState.completedChunks.length} chunks`);
    console.log(` State File:   ${partitionStateFile}`);
    console.log(`=======================================================`);
  }

  return harvestStatus === 'complete' ? 0 : 1;
}

// Direct execution from CLI
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  runHarvest().then(code => process.exit(code)).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
