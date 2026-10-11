import fs from 'fs';
import path from 'path';
import { buildSite } from './lib/build.js';
import { acquireMasterLock } from './lib/master-lock.js';

const args = process.argv.slice(2);
let dataDir = null;
let distDir = 'dist';
let configPath = 'config/config.json';
let isbnFetchFiles = true;
let issnFetchFiles = true;
let source = null;
let maxRecords = null;
let maxPagefindRecords = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--data-dir') dataDir = args[++i];
  else if (args[i] === '--dist-dir') distDir = args[++i];
  else if (args[i] === '--config') configPath = args[++i];
  else if (args[i] === '--source') source = args[++i];
  else if (args[i] === '--max-records') maxRecords = parseInt(args[++i], 10);
  else if (args[i] === '--max-pagefind-records') maxPagefindRecords = parseInt(args[++i], 10);
  else if (args[i] === '--no-isbn-fetch') isbnFetchFiles = false;
  else if (args[i] === '--no-issn-fetch') issnFetchFiles = false;
}

const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

// Resolve data directory from registered sources or config
if (!dataDir) {
  if (source) {
    const sourcesPath = path.join(process.cwd(), 'data', 'sources.json');
    if (fs.existsSync(sourcesPath)) {
      try {
        const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
        if (sources[source]?.dataPath) {
          dataDir = sources[source].dataPath;
        }
      } catch (e) {
        console.warn('Failed to parse sources.json:', e.message);
      }
    }
  }
  if (!dataDir) {
    dataDir = config.dataDir || 'data';
  }
}

async function run() {
  let lock = null;
  try {
    lock = await acquireMasterLock({
      masterPath: process.cwd(),
      provider: source || 'master',
      operation: 'build',
      wait: true
    });

    const report = await buildSite({
      dataDir,
      distDir,
      dumpsDir: 'dumps',
      baseUrl: config.baseUrl || '/pustaka-terbuka/',
      config,
      isbnFetchFiles,
      issnFetchFiles,
      maxRecords: maxRecords ?? config.maxRecords,
      maxPagefindRecords: maxPagefindRecords ?? config.maxPagefindRecords
    });
    
    console.log('Build Report:');
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  } finally {
    if (lock) {
      lock.release();
    }
  }
}

run();
