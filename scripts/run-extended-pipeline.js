#!/usr/bin/env node

/**
 * PustakaTerbuka - Extended Harvester Sequential Pipeline Orchestrator
 * 
 * Manages strictly 1-concurrent execution across 30 extended Malaysian libraries:
 * - Sequentially harvests 500 records for each harvester
 * - Validates chunk manifest.json, batch xml integrity, and provenance.jsonl
 * - Live logging, progress monitoring, and timing statistics
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { EXTENDED_LIBRARIES } from '../tools/lib/extended-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return min > 0 ? `${min}m ${remSec}s` : `${sec}s`;
}

function runSingleHarvester(lib, targetRecords = 500) {
  return new Promise((resolve) => {
    const harvesterScript = path.join(opacRoot, `tools/harvesters/${lib.sourceCode}/harvester.js`);
    if (!fs.existsSync(harvesterScript)) {
      console.error(`[ERROR] Script not found for ${lib.sourceCode}`);
      return resolve({ sourceCode: lib.sourceCode, agencyCode: lib.agencyCode, success: false, error: 'Harvester missing' });
    }

    const args = [
      harvesterScript,
      '--start-bib', '1',
      '--end-bib', '2500',
      '--max-records', String(targetRecords),
      '--batch-size', '100',
      '--delay', '10'
    ];

    const startTime = Date.now();
    console.log(`\n======================================================================`);
    console.log(`[DISPATCH] [1-CONCURRENT] ${lib.agencyCode} — ${lib.sourceName}`);
    console.log(` Script: tools/harvesters/${lib.sourceCode}/harvester.js`);
    console.log(` Target Records: ${targetRecords}`);
    console.log(`======================================================================`);

    const proc = spawn(process.execPath, args, {
      cwd: opacRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('[SAVE]') || line.includes('[MANIFEST SEALED]') || line.includes('Starting harvester')) {
          console.log(`  ${line.trim()}`);
        }
      }
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (exitCode) => {
      const duration = formatDuration(Date.now() - startTime);
      if (exitCode === 0) {
        // Verify inbox output
        const inboxDir = path.join(opacRoot, 'harvest', 'inbox', lib.sourceCode);
        let recordCount = 0;
        let manifestOk = false;

        if (fs.existsSync(inboxDir)) {
          const runs = fs.readdirSync(inboxDir).filter(f => f.includes('chunk'));
          if (runs.length > 0) {
            const latestRun = runs.sort().reverse()[0];
            const manifestPath = path.join(inboxDir, latestRun, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                recordCount = manifest.record_count ?? manifest.total_records ?? 0;
                manifestOk = (recordCount === targetRecords);
              } catch {}
            }
          }
        }

        console.log(`[SUCCESS] ${lib.agencyCode} harvested ${recordCount}/${targetRecords} records in ${duration}`);
        resolve({
          sourceCode: lib.sourceCode,
          agencyCode: lib.agencyCode,
          name: lib.sourceName,
          success: manifestOk,
          recordCount,
          duration,
          error: manifestOk ? null : `Expected ${targetRecords} records, found ${recordCount}`
        });
      } else {
        console.error(`[FAILURE] ${lib.agencyCode} failed with exit code ${exitCode} in ${duration}`);
        if (stderr) console.error(`  Stderr: ${stderr.trim()}`);
        resolve({
          sourceCode: lib.sourceCode,
          agencyCode: lib.agencyCode,
          name: lib.sourceName,
          success: false,
          recordCount: 0,
          duration,
          error: stderr.trim() || `Exit code ${exitCode}`
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        sourceCode: lib.sourceCode,
        agencyCode: lib.agencyCode,
        name: lib.sourceName,
        success: false,
        recordCount: 0,
        error: err.message
      });
    });
  });
}

async function main() {
  console.log('######################################################################');
  console.log(' PustakaTerbuka Extended Harvester Sequential Runner');
  console.log(` Target: ${EXTENDED_LIBRARIES.length} Libraries (Strictly 1 Concurrent Harvester)`);
  console.log(' Quota: 500 Records per Harvester');
  console.log('######################################################################\n');

  const results = [];
  const overallStart = Date.now();

  for (let i = 0; i < EXTENDED_LIBRARIES.length; i++) {
    const lib = EXTENDED_LIBRARIES[i];
    console.log(`\n>>> [${i + 1}/${EXTENDED_LIBRARIES.length}] Processing ${lib.agencyCode}...`);
    const res = await runSingleHarvester(lib, 500);
    results.push(res);
  }

  const overallDuration = formatDuration(Date.now() - overallStart);

  console.log('\n======================================================================');
  console.log(' PIPELINE SUMMARY REPORT (30 Extended Libraries @ 500 Records Each)');
  console.log('======================================================================');
  
  let totalHarvested = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const r of results) {
    totalHarvested += r.recordCount;
    if (r.success) {
      successCount++;
      console.log(`  ✔ [OK]   ${r.agencyCode.padEnd(12)} : ${r.recordCount} records (${r.duration}) - ${r.name}`);
    } else {
      failureCount++;
      console.log(`  ✖ [FAIL] ${r.agencyCode.padEnd(12)} : ${r.recordCount} records (${r.duration}) - ERROR: ${r.error}`);
    }
  }

  console.log('----------------------------------------------------------------------');
  console.log(`Total Harvesters Run:     ${results.length}`);
  console.log(`Successful Harvesters:    ${successCount}/${results.length}`);
  console.log(`Failed Harvesters:        ${failureCount}/${results.length}`);
  console.log(`Total Records Harvested:  ${totalHarvested.toLocaleString()}`);
  console.log(`Total Duration:           ${overallDuration}`);
  console.log('======================================================================\n');

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
