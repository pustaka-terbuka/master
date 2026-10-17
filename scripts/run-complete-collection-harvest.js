#!/usr/bin/env node

/**
 * PustakaTerbuka - Complete Collection Harvester for 30 Extended Malaysian Libraries
 * 
 * Sequentially sweeps the entire remaining collections (from bib 10,001 to defaultMaxBib):
 * - Strictly 1 concurrent harvester running at a time
 * - High-throughput batch size of 1,000 records per XML batch
 * - Validates chunk manifests and checksums with tools/validate-inbox.js
 * - Generates comprehensive status report upon completion
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { EXTENDED_LIBRARIES } from '../tools/lib/extended-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

const START_BIB = 10001;

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
    p.stdout.on('data', d => {
      const s = d.toString();
      out += s;
      const lines = s.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('[SAVE]') && (trimmed.endsWith('0000)') || trimmed.endsWith('5000)'))) {
          console.log(`    ${trimmed}`);
        }
      }
    });
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on('error', e => resolve({ code: -1, out: '', err: e.message }));
  });
}

function findExistingFullSweepChunk(sourceCode, expectedCount) {
  const inboxDir = path.join(opacRoot, 'harvest', 'inbox', sourceCode);
  if (!fs.existsSync(inboxDir)) return null;
  const dirs = fs.readdirSync(inboxDir).filter(d => {
    try {
      return fs.statSync(path.join(inboxDir, d)).isDirectory() && d.includes('chunk');
    } catch {
      return false;
    }
  });
  if (dirs.length === 0) return null;
  dirs.sort();
  for (let i = dirs.length - 1; i >= 0; i--) {
    const chunkDir = path.join(inboxDir, dirs[i]);
    const manifestPath = path.join(chunkDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const count = m.record_count || m.total_records || 0;
        if (count >= expectedCount && m.status === 'complete') {
          return { chunkDir, count, manifest: m };
        }
      } catch {}
    }
  }
  return null;
}

async function harvestRemainingRecords(lib, index, total) {
  const targetEndBib = lib.defaultMaxBib || 100000;
  const expectedRemaining = targetEndBib - START_BIB + 1;
  const startTime = Date.now();

  console.log(`\n======================================================================`);
  console.log(`[${index + 1}/${total}] [1-CONCURRENT] ${lib.agencyCode} — ${lib.sourceName}`);
  console.log(` Sweeping Remaining Range: ${START_BIB.toLocaleString()} to ${targetEndBib.toLocaleString()} (${expectedRemaining.toLocaleString()} records)`);
  console.log(`======================================================================`);

  const existing = findExistingFullSweepChunk(lib.sourceCode, expectedRemaining);
  if (existing) {
    console.log(`[ALREADY COMPLETE] Found verified full sweep chunk (${existing.count.toLocaleString()} records) at: ${path.basename(existing.chunkDir)}`);
    return {
      success: true,
      recordsHarvested: existing.count,
      chunkDir: existing.chunkDir,
      duration: '0s',
      skipped: true
    };
  }

  const harvesterScript = path.join(opacRoot, `tools/harvesters/${lib.sourceCode}/harvester.js`);
  if (!fs.existsSync(harvesterScript)) {
    console.error(`[ERROR] Harvester script missing: ${harvesterScript}`);
    return { success: false, error: 'Harvester script missing', duration: '0s' };
  }

  const args = [
    harvesterScript,
    '--start-bib', String(START_BIB),
    '--end-bib', String(targetEndBib),
    '--max-records', String(expectedRemaining),
    '--batch-size', '1000',
    '--delay', '0'
  ];

  console.log(`  Spawning harvester: start-bib=${START_BIB}, end-bib=${targetEndBib}, batch-size=1000...`);
  const hResult = await execCommand(process.execPath, args, opacRoot);
  if (hResult.code !== 0) {
    console.error(`[HARVEST FAILED] Exit code ${hResult.code}: ${hResult.err}`);
    return { success: false, error: hResult.err || `Exit code ${hResult.code}`, duration: formatDuration(Date.now() - startTime) };
  }

  // Find newly sealed chunk
  const newlyCreated = findExistingFullSweepChunk(lib.sourceCode, expectedRemaining);
  if (!newlyCreated) {
    console.error(`[ERROR] Full sweep chunk directory not found after harvest for ${lib.sourceCode}`);
    return { success: false, error: 'Chunk not found after harvest', duration: formatDuration(Date.now() - startTime) };
  }

  console.log(`  [HARVEST COMPLETE] Sealed ${newlyCreated.count.toLocaleString()} records in ${path.basename(newlyCreated.chunkDir)}`);

  // Validate chunk
  console.log(`  Validating full sweep chunk with validate-inbox.js...`);
  const vResult = await execCommand(process.execPath, [path.join(opacRoot, 'tools/validate-inbox.js'), newlyCreated.chunkDir], opacRoot);
  if (vResult.code !== 0) {
    console.warn(`  [WARN] validate-inbox warnings: ${vResult.out || vResult.err}`);
  } else {
    console.log(`  [VALIDATION OK] All XML batches and manifest checksums verified.`);
  }

  const duration = formatDuration(Date.now() - startTime);
  console.log(`[SUCCESS] [${index + 1}/${total}] ${lib.agencyCode} finished in ${duration}`);
  return {
    success: true,
    recordsHarvested: newlyCreated.count,
    chunkDir: newlyCreated.chunkDir,
    duration
  };
}

async function runFullCollectionPipeline() {
  const overallStart = Date.now();
  console.log(`######################################################################`);
  console.log(` PUSTAKATERBUKA - COMPLETE COLLECTION HARVESTER PIPELINE`);
  console.log(` Concurrency: Strictly 1 concurrent harvester`);
  console.log(` Target Institutions: ${EXTENDED_LIBRARIES.length} libraries`);
  console.log(` Range: Record ${START_BIB.toLocaleString()} to each institution's defaultMaxBib`);
  console.log(`######################################################################`);

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let totalHarvestedRecords = 0;

  for (let i = 0; i < EXTENDED_LIBRARIES.length; i++) {
    const lib = EXTENDED_LIBRARIES[i];
    const res = await harvestRemainingRecords(lib, i, EXTENDED_LIBRARIES.length);
    results.push({ ...lib, ...res });

    if (res.success) {
      successCount++;
      totalHarvestedRecords += (res.recordsHarvested || 0);
    } else {
      failCount++;
    }

    console.log(`[QUEUE PROGRESS] Completed: ${successCount} | Failed: ${failCount} | Remaining: ${EXTENDED_LIBRARIES.length - (i + 1)}`);
  }

  const totalDuration = formatDuration(Date.now() - overallStart);
  console.log(`\n======================================================================`);
  console.log(` COMPLETE COLLECTION HARVEST FINISHED!`);
  console.log(` Total Duration:             ${totalDuration}`);
  console.log(` Successful Institutions:    ${successCount}/${EXTENDED_LIBRARIES.length}`);
  console.log(` Failed Institutions:        ${failCount}`);
  console.log(` Total Remaining Harvested:  ${totalHarvestedRecords.toLocaleString()} records`);
  console.log(`======================================================================\n`);

  // Write report
  const reportPath = path.join(opacRoot, 'harvest', 'complete-collection-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalDuration,
    successCount,
    failCount,
    totalHarvestedRecords,
    results
  }, null, 2), 'utf8');

  console.log(`Detailed report written to: ${reportPath}`);
}

runFullCollectionPipeline().catch(err => {
  console.error('[FATAL] Complete collection harvest failed:', err);
  process.exit(1);
});
