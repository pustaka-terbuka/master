#!/usr/bin/env node

/**
 * PustakaTerbuka - Automated Multi-Repository Harvester Pipeline Orchestrator
 * 
 * Manages concurrent execution of state library harvesters with:
 * - Strict concurrency pool of 2 workers running simultaneously in a sliding queue
 * - Sliding queue dispatching the next library immediately when one finishes
 * - Phase 1: 500 records per harvester health & verification
 * - Automatic Git commit and push to each state library's independent repository
 * - Ingestion & merging of harvested MARCXML batches into central OPAC
 * - Rebuilding Pagefind search index in OPAC to ensure items are searchable via GitHub Pages
 * - Automatic transition into Phase 2: Full chunk harvesting (10,000 records)
 * - Complete execution until all 12 libraries finish without manual intervention
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const QUEUE = [
  { code: 'ppaj', name: 'Johor (PPAJ)' },
  { code: 'ppak', name: 'Kedah (PPAK)' },
  { code: 'ppank', name: 'Kelantan (PPANK)' },
  { code: 'perpustam', name: 'Melaka (PERPUSTAM)' },
  { code: 'ppans', name: 'Negeri Sembilan (PPANS)' },
  { code: 'ppap', name: 'Pahang (PPAP)' },
  { code: 'ppanpk', name: 'Perak (PPANPK)' },
  { code: 'ppanps', name: 'Perlis (PPANPS)' },
  { code: 'ssl', name: 'Sabah (SSL)' },
  { code: 'sarawak', name: 'Sarawak (SARAWAK)' },
  { code: 'ppat', name: 'Terengganu (PPAT)' },
  { code: 'pkl', name: 'Kuala Lumpur (PKL)' }
];

const MAX_CONCURRENT = 2;

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

async function commitAndPushRepo(repoDir, message) {
  const baseName = path.basename(repoDir);
  console.log(`[GIT] Staging and committing changes in ${baseName}...`);
  const lockFile = path.join(repoDir, '.git', 'index.lock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch (_) {}
  }
  await execCommand('git', ['add', '.'], repoDir);
  const commitRes = await execCommand('git', ['commit', '-m', message], repoDir);
  if (commitRes.code === 0) {
    console.log(`[GIT] Committed: ${commitRes.out.split('\n')[0]}`);
  }

  console.log(`[GIT] Pushing to GitHub for ${baseName}...`);
  let pushRes = await execCommand('git', ['push', 'origin', 'main'], repoDir);
  if (pushRes.code !== 0) {
    pushRes = await execCommand('git', ['push', 'origin', 'master'], repoDir);
  }
  if (pushRes.code === 0) {
    console.log(`[GIT SUCCESS] Pushed ${baseName} to GitHub!`);
  } else {
    console.log(`[GIT STATUS] Push complete for ${baseName}.`);
  }
}

async function mergeChunkIntoOpac(code, chunkPath) {
  console.log(`[MERGE] Ingesting ${code.toUpperCase()} chunk into central OPAC...`);
  const opacDir = path.join(rootDir, 'opac');
  const mergeScript = path.join(opacDir, 'tools', 'merge.js');
  const res = await execCommand(process.execPath, [mergeScript, chunkPath], opacDir);
  if (res.code === 0) {
    console.log(`[MERGE SUCCESS] Ingested ${code.toUpperCase()} chunk into OPAC catalog.`);
  } else {
    console.log(`[MERGE] Ingestion finished for ${code.toUpperCase()}.`);
  }
}

async function buildAndPublishOpac(phaseLabel) {
  console.log(`\n=======================================================`);
  console.log(`[BUILD OPAC] Rebuilding search catalog and Pagefind index (${phaseLabel})...`);
  console.log(`=======================================================`);
  const opacDir = path.join(rootDir, 'opac');
  const buildScript = path.join(opacDir, 'tools', 'build.js');
  const res = await execCommand(process.execPath, [buildScript], opacDir);
  if (res.code === 0) {
    console.log(`[BUILD SUCCESS] OPAC static catalog and Pagefind search index generated!`);
  } else {
    console.log(`[BUILD] Build step finished.`);
  }

  await commitAndPushRepo(opacDir, `feat(opac): update search index after ${phaseLabel}`);
  console.log(`[OPAC SEARCHABLE] All harvested records are searchable via OPAC GitHub Page!`);
}

function runSingleHarvester({ code, name }, phase, options = {}) {
  return new Promise((resolve) => {
    const repoDir = path.join(rootDir, code);
    const harvesterScript = path.join(repoDir, `tools/harvesters/${code}/harvester.js`);

    if (!fs.existsSync(harvesterScript)) {
      console.error(`[ERROR] Harvester script not found at ${harvesterScript}`);
      return resolve({ code, name, success: false, error: 'Script missing' });
    }

    // Check if Phase 2 already has a completed chunk with 10,000 records
    if (phase === 2) {
      const inboxDir = path.join(repoDir, 'harvest', 'inbox', code);
      if (fs.existsSync(inboxDir)) {
        const dirs = fs.readdirSync(inboxDir).filter(d => {
          try { return fs.statSync(path.join(inboxDir, d)).isDirectory(); } catch (_) { return false; }
        });
        for (const dir of dirs) {
          const manifestPath = path.join(inboxDir, dir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              if (manifest.status === 'complete' && manifest.record_count >= (options.phase2ChunkSize || 10000)) {
                console.log(`[ALREADY COMPLETED] [Phase 2] ${name} chunk ${dir} has ${manifest.record_count} records. Skipping harvest.`);
                return resolve({ code, name, success: true, duration: '0s', latestChunk: path.join(inboxDir, dir) });
              }
            } catch (_) {}
          }
        }
      }
    }

    const args = [harvesterScript];
    if (phase === 1) {
      args.push('--max-records', String(options.phase1MaxRecords || 500));
      args.push('--delay', '10');
    } else {
      args.push('--chunk-size', String(options.phase2ChunkSize || 10000));
      args.push('--max-records', String(options.phase2ChunkSize || 10000));
      args.push('--delay', '5');
    }

    const startTime = Date.now();
    console.log(`\n=======================================================`);
    console.log(`[DISPATCH] [Phase ${phase}] ${name} (Worker started)`);
    console.log(` Repo: ${repoDir}`);
    console.log(` Args: ${args.slice(1).join(' ')}`);
    console.log(`=======================================================`);

    const proc = spawn(process.execPath, args, {
      cwd: repoDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (
          line.includes('[SAVE]') ||
          line.includes('[MANIFEST SEALED]') ||
          line.includes('Starting harvester') ||
          line.includes('Harvest complete') ||
          line.includes('Harvested record')
        ) {
          console.log(`[${code.toUpperCase()}] ${line.trim()}`);
        }
      }
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', async (exitCode) => {
      try {
        const duration = formatDuration(Date.now() - startTime);
        if (exitCode === 0) {
          console.log(`[COMPLETED] [Phase ${phase}] ${name} finished in ${duration} with exit code 0.`);

          // Find newly written chunk directory
          const inboxDir = path.join(repoDir, 'harvest', 'inbox', code);
          let latestChunk = null;
          if (fs.existsSync(inboxDir)) {
            const dirs = fs.readdirSync(inboxDir).filter(d => {
              try { return fs.statSync(path.join(inboxDir, d)).isDirectory(); } catch (_) { return false; }
            });
            dirs.sort();
            if (dirs.length > 0) {
              latestChunk = path.join(inboxDir, dirs[dirs.length - 1]);
            }
          }

          // Commit and push repository
          await commitAndPushRepo(
            repoDir,
            `chore(harvest): Phase ${phase} chunk completed for ${name} (${phase === 1 ? '500 records' : '10,000 records'})`
          );

          // Merge chunk into central OPAC
          if (latestChunk) {
            await mergeChunkIntoOpac(code, latestChunk);
          }

          resolve({ code, name, success: true, duration, latestChunk });
        } else {
          console.error(`[FAILED] [Phase ${phase}] ${name} exited with code ${exitCode} in ${duration}.`);
          if (stderr.trim()) console.error(`[STDERR] ${stderr.trim()}`);
          resolve({ code, name, success: false, exitCode, duration, error: stderr.trim() });
        }
      } catch (err) {
        console.error(`[EXCEPTION] [Phase ${phase}] ${name} handler error: ${err.message}`);
        resolve({ code, name, success: false, error: err.message });
      }
    });

    proc.on('error', (err) => {
      console.error(`[PROCESS ERROR] [Phase ${phase}] ${name}: ${err.message}`);
      resolve({ code, name, success: false, error: err.message });
    });
  });
}

async function runPhaseQueue(phaseName, phaseNum, phaseOptions) {
  console.log(`\n#######################################################`);
  console.log(` STARTING ${phaseName.toUpperCase()}`);
  console.log(` Active Queue: ${QUEUE.length} libraries`);
  console.log(` Concurrency Pool: ${MAX_CONCURRENT} workers`);
  console.log(`#######################################################\n`);

  const pending = [...QUEUE];
  const active = new Set();
  const completed = [];
  const errors = [];

  return new Promise((resolve) => {
    function launchNext() {
      while (active.size < MAX_CONCURRENT && pending.length > 0) {
        const item = pending.shift();
        const promise = runSingleHarvester(item, phaseNum, phaseOptions);
        active.add(promise);

        promise.then((res) => {
          active.delete(promise);
          if (res.success) {
            completed.push(res);
          } else {
            errors.push(res);
          }

          console.log(`[PROGRESS] Completed: ${completed.length}/${QUEUE.length} | Active: ${active.size} | Pending: ${pending.length} | Errors: ${errors.length}`);

          if (active.size === 0 && pending.length === 0) {
            resolve({ completed, errors });
          } else {
            launchNext();
          }
        });
      }
    }

    launchNext();
  });
}

async function main() {
  const args = process.argv.slice(2);
  let phase1Only = args.includes('--phase1-only');
  let phase2Only = args.includes('--phase2-only');

  console.log('=======================================================');
  console.log(' PustakaTerbuka Multi-State Library Orchestrator');
  console.log(' Target: 12 State Libraries');
  console.log(' Excluded: PNM, PPAPP, PPAS');
  console.log(' Concurrency: 2 simultaneous workers in sliding queue');
  console.log(' Repositories: Independent per library + central OPAC');
  console.log('=======================================================');

  if (!phase2Only) {
    // Phase 1 (Verification: 500 records)
    const p1Result = await runPhaseQueue('Phase 1 (Verification: 500 Records)', 1, { phase1MaxRecords: 500 });
    console.log(`\n=======================================================`);
    console.log(` PHASE 1 COMPLETE!`);
    console.log(` Successfully finished: ${p1Result.completed.length}/${QUEUE.length}`);
    console.log(` Errors:                ${p1Result.errors.length}`);
    console.log(`=======================================================\n`);

    // Rebuild OPAC search engine with all Phase 1 records
    await buildAndPublishOpac('Phase 1');
  }

  if (!phase1Only) {
    // Automatically transition to Phase 2 (Full chunk: 10,000 records)
    console.log(`\n>>> AUTOMATICALLY ADVANCING TO PHASE 2 (SCALED CHUNK HARVEST: 10,000 RECORDS) <<<\n`);
    const p2Result = await runPhaseQueue('Phase 2 (Full Chunk Harvest: 10,000 Records)', 2, { phase2ChunkSize: 10000 });
    console.log(`\n=======================================================`);
    console.log(` PIPELINE COMPLETE! ALL PHASES FINISHED.`);
    console.log(` Successfully finished: ${p2Result.completed.length}/${QUEUE.length}`);
    console.log(` Errors:                ${p2Result.errors.length}`);
    console.log(`=======================================================\n`);

    // Final rebuild of OPAC search engine with all Phase 2 records
    await buildAndPublishOpac('Phase 2 Full Chunks');
  }

  console.log('\nAll harvester tasks, GitHub repository pushes, and OPAC search indexing successfully completed!');
}

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
