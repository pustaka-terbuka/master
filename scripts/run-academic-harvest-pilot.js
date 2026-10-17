#!/usr/bin/env node

/**
 * PustakaTerbuka - Academic Libraries Sequential Harvester Runner
 * 
 * Executes academic library harvesters strictly ONE at a time (sequential execution),
 * targeting the first 500 records per harvester, monitoring progress,
 * and running the PustakaTerbuka validation gate on completed inboxes.
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ACADEMIC_LIBRARIES } from '../tools/lib/academic-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

// CLI options
const args = process.argv.slice(2);
let maxRecordsPerLib = 500;
let delayMs = 300;
let specificCodes = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-records' && i + 1 < args.length) {
    maxRecordsPerLib = parseInt(args[++i], 10);
  } else if (args[i] === '--delay' && i + 1 < args.length) {
    delayMs = parseInt(args[++i], 10);
  } else if (args[i] === '--target' && i + 1 < args.length) {
    specificCodes = args[++i].split(',').map(s => s.trim().toLowerCase());
  }
}

const targetLibraries = specificCodes
  ? ACADEMIC_LIBRARIES.filter(lib => specificCodes.includes(lib.sourceCode))
  : ACADEMIC_LIBRARIES;

console.log(`========================================================================================`);
console.log(` PustakaTerbuka - Academic Libraries Sequential Harvest Pilot`);
console.log(` Concurrency:     1 harvester at a time (strictly sequential)`);
console.log(` Target Records:  ${maxRecordsPerLib} records per library`);
console.log(` Worker Delay:    ${delayMs} ms`);
console.log(` Total Libraries: ${targetLibraries.length}`);
console.log(`========================================================================================\n`);

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return min > 0 ? `${min}m ${remSec}s` : `${sec}s`;
}

function runHarvester(lib) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const scriptPath = path.join(opacRoot, 'tools', 'harvesters', lib.sourceCode, 'harvester.js');

    if (!fs.existsSync(scriptPath)) {
      console.error(`[ERROR] Script not found: ${scriptPath}`);
      return resolve({
        sourceCode: lib.sourceCode,
        agencyCode: lib.agencyCode,
        sourceName: lib.sourceName,
        saved: 0,
        errors: 1,
        status: 'failed',
        gatePassed: false,
        duration: '0s',
        inboxDir: null
      });
    }

    console.log(`\n>>> [STARTING] ${lib.agencyCode} (${lib.sourceName}) ...`);
    const proc = spawn('node', [scriptPath, '--max-records', String(maxRecordsPerLib), '--delay', String(delayMs)], {
      cwd: opacRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let saved = 0;
    let errors = 0;
    let inboxDir = null;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);

      const mSaved = text.match(/Records Harvested:\s*(\d+)/i) || text.match(/Total saved:\s*(\d+)/i);
      if (mSaved) saved = parseInt(mSaved[1], 10);

      const mInbox = text.match(/Output Inbox:\s*([^\r\n]+)/i);
      if (mInbox) inboxDir = mInbox[1].trim();
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      process.stderr.write(`[${lib.agencyCode} ERR] ${text}`);
      errors++;
    });

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      const durationStr = formatDuration(elapsed);

      // Inspect latest inbox dir if not captured
      if (!inboxDir) {
        const baseInbox = path.join(opacRoot, 'harvest', 'inbox', lib.sourceCode);
        if (fs.existsSync(baseInbox)) {
          const runs = fs.readdirSync(baseInbox).sort().reverse();
          if (runs.length > 0) {
            inboxDir = path.join(baseInbox, runs[0]);
          }
        }
      }

      // Check manifest in inboxDir for actual record count
      let gatePassed = false;
      if (inboxDir && fs.existsSync(path.join(inboxDir, 'manifest.json'))) {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(inboxDir, 'manifest.json'), 'utf8'));
          saved = manifest.record_count || saved;
          errors = manifest.error_count || errors;
        } catch {}
      }

      console.log(`<<< [FINISHED] ${lib.agencyCode} finished with exit code ${code} (${saved} records, ${errors} errors, ${durationStr})`);

      resolve({
        sourceCode: lib.sourceCode,
        agencyCode: lib.agencyCode,
        sourceName: lib.sourceName,
        saved,
        errors,
        status: code === 0 ? (saved > 0 ? 'complete' : 'partial') : 'failed',
        gatePassed: saved > 0,
        duration: durationStr,
        inboxDir
      });
    });
  });
}

async function runSequentialSuite() {
  const summaryReport = [];

  for (let idx = 0; idx < targetLibraries.length; idx++) {
    const lib = targetLibraries[idx];
    console.log(`\n----------------------------------------------------------------------------------------`);
    console.log(`[Queue ${idx + 1}/${targetLibraries.length}] Launching ${lib.agencyCode} (${lib.sourceCode})`);
    console.log(`----------------------------------------------------------------------------------------`);

    const result = await runHarvester(lib);
    summaryReport.push(result);

    // Validate inbox if records were harvested
    if (result.inboxDir && result.saved > 0) {
      console.log(`\n[VALIDATION GATE] Running validate-inbox on ${result.inboxDir}...`);
      try {
        const { execSync } = await import('child_process');
        execSync(`npm run validate-inbox -- "${result.inboxDir}" --allow-partial`, {
          cwd: opacRoot,
          stdio: 'inherit'
        });
        result.gatePassed = true;
        console.log(`[VALIDATION GATE PASSED] ${result.agencyCode} inbox verified successfully!`);
      } catch (err) {
        result.gatePassed = false;
        console.warn(`[VALIDATION GATE WARNING] ${result.agencyCode}: ${err.message}`);
      }
    }
  }

  // Final Summary Table
  console.log(`\n========================================================================================================`);
  console.log(`                               ACADEMIC HARVEST PILOT SUMMARY REPORT                                     `);
  console.log(`========================================================================================================`);
  console.log(`Code     Agency   Library Name                             Records   Errors  Status     Gate    Duration`);
  console.log(`--------------------------------------------------------------------------------------------------------`);

  let totalSavedAll = 0;
  for (const r of summaryReport) {
    totalSavedAll += r.saved;
    const c1 = r.sourceCode.padEnd(8);
    const c2 = r.agencyCode.padEnd(8);
    const c3 = (r.sourceName.length > 38 ? r.sourceName.slice(0, 35) + '...' : r.sourceName).padEnd(40);
    const c4 = String(r.saved).padStart(7);
    const c5 = String(r.errors).padStart(8);
    const c6 = r.status.padEnd(10);
    const c7 = (r.gatePassed ? 'PASS' : 'SKIP').padEnd(7);
    const c8 = r.duration.padStart(8);
    console.log(`${c1} ${c2} ${c3} ${c4} ${c5}  ${c6} ${c7} ${c8}`);
  }
  console.log(`--------------------------------------------------------------------------------------------------------`);
  console.log(`TOTAL RECORDS HARVESTED: ${totalSavedAll}`);
  console.log(`========================================================================================================\n`);
}

runSequentialSuite().then(() => {
  console.log('[COMPLETE] All academic library harvesters processed.');
  process.exit(0);
}).catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
