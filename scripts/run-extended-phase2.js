#!/usr/bin/env node

/**
 * PustakaTerbuka - Phase 2 Extended Harvester Sequential Pipeline Orchestrator
 * 
 * Manages strictly 1-concurrent execution across 30 extended Malaysian libraries:
 * - Sequentially harvests Phase 2 full chunks (10,000 records each)
 * - Validates chunk manifest.json, batch xml integrity, and provenance.jsonl
 * - Ingests and merges into central OPAC catalog
 * - Provides live progress logging, timing statistics, and fault recovery
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { EXTENDED_LIBRARIES } from '../tools/lib/extended-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

const TARGET_RECORDS = 10000;

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return min > 0 ? `${min}m ${remSec}s` : `${sec}s`;
}

function execCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on('error', e => resolve({ code: -1, out: '', err: e.message }));
  });
}

function findLatestChunk(sourceCode) {
  const inboxDir = path.join(opacRoot, 'harvest', 'inbox', sourceCode);
  if (!fs.existsSync(inboxDir)) return null;
  const dirs = fs.readdirSync(inboxDir).filter(d => {
    try {
      const p = path.join(inboxDir, d);
      return fs.statSync(p).isDirectory() && d.includes('chunk');
    } catch {
      return false;
    }
  });
  if (dirs.length === 0) return null;
  dirs.sort();
  // Check the latest chunk that has 10,000 records
  for (let i = dirs.length - 1; i >= 0; i--) {
    const chunkDir = path.join(inboxDir, dirs[i]);
    const manifestPath = path.join(chunkDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if ((m.record_count || m.total_records) >= TARGET_RECORDS && m.status === 'complete') {
          return { chunkDir, manifest: m };
        }
      } catch {}
    }
  }
  return null;
}

async function harvestSingleLibrary(lib, index, total) {
  const startTime = Date.now();
  console.log(`\n======================================================================`);
  console.log(`[${index + 1}/${total}] [1-CONCURRENT] ${lib.agencyCode} — ${lib.sourceName}`);
  console.log(` Source: ${lib.sourceCode} | Target: ${TARGET_RECORDS} records (Phase 2 Chunk)`);
  console.log(`======================================================================`);

  // Check if Phase 2 10k chunk already harvested
  const existing = findLatestChunk(lib.sourceCode);
  let chunkDir = existing?.chunkDir;

  if (existing) {
    console.log(`[ALREADY HARVESTED] Found existing sealed 10k chunk at: ${chunkDir}`);
  } else {
    const harvesterScript = path.join(opacRoot, `tools/harvesters/${lib.sourceCode}/harvester.js`);
    if (!fs.existsSync(harvesterScript)) {
      console.error(`[ERROR] Harvester script missing: ${harvesterScript}`);
      return { success: false, error: 'Harvester script missing', duration: '0s' };
    }

    const args = [
      harvesterScript,
      '--start-bib', '1',
      '--end-bib', '250000',
      '--max-records', String(TARGET_RECORDS),
      '--batch-size', '100',
      '--delay', '0'
    ];

    console.log(`  Spawning harvester: node ${path.basename(harvesterScript)} --max-records ${TARGET_RECORDS}...`);
    const hResult = await execCommand(process.execPath, args, opacRoot);
    if (hResult.code !== 0) {
      console.error(`[HARVEST FAILED] Exit code ${hResult.code}: ${hResult.err}`);
      return { success: false, error: hResult.err || `Exit code ${hResult.code}`, duration: formatDuration(Date.now() - startTime) };
    }

    const newChunk = findLatestChunk(lib.sourceCode);
    if (!newChunk) {
      console.error(`[ERROR] Chunk directory not found after harvest for ${lib.sourceCode}`);
      return { success: false, error: 'Chunk directory not found', duration: formatDuration(Date.now() - startTime) };
    }
    chunkDir = newChunk.chunkDir;
    console.log(`  [HARVEST COMPLETE] Saved to ${path.basename(chunkDir)}`);
  }

  // Validate chunk
  console.log(`  Validating chunk with validate-inbox.js...`);
  const vResult = await execCommand(process.execPath, [path.join(opacRoot, 'tools/validate-inbox.js'), chunkDir], opacRoot);
  if (vResult.code !== 0) {
    console.warn(`  [WARN] validate-inbox warnings: ${vResult.out || vResult.err}`);
  } else {
    console.log(`  [VALIDATION OK] Manifest and checksums verified.`);
  }

  // Merge chunk into OPAC
  console.log(`  Merging ${TARGET_RECORDS} records into central OPAC...`);
  const mResult = await execCommand(process.execPath, [path.join(opacRoot, 'tools/merge.js'), chunkDir], opacRoot);
  if (mResult.code !== 0) {
    console.error(`  [MERGE FAILED] ${mResult.err}`);
    return { success: false, error: mResult.err || 'Merge failed', duration: formatDuration(Date.now() - startTime) };
  }

  const duration = formatDuration(Date.now() - startTime);
  console.log(`[SUCCESS] [${index + 1}/${total}] ${lib.agencyCode} finished Phase 2 in ${duration}`);
  return { success: true, duration, chunkDir };
}

async function runPhase2Pipeline() {
  const overallStart = Date.now();
  console.log(`######################################################################`);
  console.log(` PUSTAKATERBUKA - EXTENDED LIBRARIES PHASE 2 PIPELINE`);
  console.log(` Concurrency: Strictly 1 concurrent harvester`);
  console.log(` Target Libraries: ${EXTENDED_LIBRARIES.length} institutions`);
  console.log(` Records Per Harvester: ${TARGET_RECORDS.toLocaleString()}`);
  console.log(` Total Records Target: ${(EXTENDED_LIBRARIES.length * TARGET_RECORDS).toLocaleString()}`);
  console.log(`######################################################################`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < EXTENDED_LIBRARIES.length; i++) {
    const lib = EXTENDED_LIBRARIES[i];
    const res = await harvestSingleLibrary(lib, i, EXTENDED_LIBRARIES.length);
    results.push({ ...lib, ...res });
    if (res.success) {
      successCount++;
    } else {
      failCount++;
    }
    console.log(`[QUEUE PROGRESS] Completed: ${successCount} | Failed: ${failCount} | Remaining: ${EXTENDED_LIBRARIES.length - (i + 1)}`);
  }

  const totalDuration = formatDuration(Date.now() - overallStart);
  console.log(`\n======================================================================`);
  console.log(` PHASE 2 HARVEST & MERGE COMPLETE!`);
  console.log(` Total Time:       ${totalDuration}`);
  console.log(` Successful:       ${successCount}/${EXTENDED_LIBRARIES.length}`);
  console.log(` Failed:           ${failCount}`);
  console.log(` Total Records:    ${(successCount * TARGET_RECORDS).toLocaleString()}`);
  console.log(`======================================================================\n`);

  // Write report
  const reportPath = path.join(opacRoot, 'harvest', 'phase2-extended-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalDuration,
    successCount,
    failCount,
    targetRecordsPerHarvester: TARGET_RECORDS,
    results
  }, null, 2), 'utf8');
  console.log(`Detailed report written to: ${reportPath}`);
}

runPhase2Pipeline().catch(err => {
  console.error('[FATAL] Pipeline failed:', err);
  process.exit(1);
});
