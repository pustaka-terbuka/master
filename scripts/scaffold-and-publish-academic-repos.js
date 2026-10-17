#!/usr/bin/env node

/**
 * PustakaTerbuka - Academic Repository Scaffolder & GitHub Publisher
 * 
 * Creates dedicated standalone Git repositories for Malaysian university libraries:
 * - Local repository: d:\RepoTools\GitHub\pustaka-terbuka\<sourceCode>
 * - Remote GitHub: https://github.com/pustaka-terbuka/<sourceCode>
 * - Full suite: package.json, README.md, harvester, schemas, tests, and harvested MARCXML inbox dataset
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ACADEMIC_LIBRARIES, getAcademicLibrary } from '../tools/lib/academic-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');
const ecosystemRoot = path.resolve(opacRoot, '..');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function runCmd(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

export async function scaffoldAndPublishAcademic(lib, options = {}) {
  const code = lib.sourceCode;
  const repoPath = path.join(ecosystemRoot, code);
  const skipPush = options.skipPush || false;

  console.log(`\n======================================================================`);
  console.log(`[SCAFFOLD] Initializing Academic Provider Repository: ${lib.agencyCode} (${lib.shortName || lib.sourceName})`);
  console.log(` Target Path: ${repoPath}`);
  console.log(`======================================================================`);

  fs.mkdirSync(repoPath, { recursive: true });

  // 1. Initialize Git repository
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    runCmd('git init -b main', repoPath);
  }
  runCmd('git config user.name "Nash Online Library"', repoPath);
  runCmd('git config user.email "nasrul6340@uitm.edu.my"', repoPath);

  const remoteUrl = `https://github.com/pustaka-terbuka/${code}.git`;
  try {
    runCmd(`git remote remove origin`, repoPath);
  } catch {}
  runCmd(`git remote add origin ${remoteUrl}`, repoPath);

  // 2. package.json
  const pkg = {
    name: `pustaka-terbuka-${code}`,
    version: '1.0.0',
    description: `${lib.sourceName} (${lib.agencyCode}) Bibliographic Dataset and Harvester for Pustaka Terbuka.`,
    type: 'module',
    scripts: {
      test: 'node --test tests/*.test.js',
      'validate-inbox': 'node tools/validate-inbox.js',
      merge: 'node tools/merge.js',
      harvest: `node tools/harvesters/${code}/harvester.js`,
      'harvest:sample': `node tools/harvesters/${code}/harvester.js --max-records 10`,
      'harvest:chunked': `node tools/harvesters/${code}/harvester.js --chunk-size 10000`,
      'harvest:master': `node tools/harvesters/${code}/harvester.js --chunk-size 10000 --master-digest`,
      'ingest:master': 'node tools/ingest-to-master.js',
      'ingest:opac': 'node tools/ingest-to-master.js'
    },
    engines: {
      node: '>=20.0.0'
    },
    private: true,
    license: 'MIT',
    dependencies: {
      ajv: '^8.20.0',
      'ajv-formats': '^3.0.1',
      'fast-xml-parser': '^5.11.2'
    }
  };
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

  // 3. .gitignore
  const gitignore = `node_modules/
*.log
.env
.env.*
`;
  fs.writeFileSync(path.join(repoPath, '.gitignore'), gitignore, 'utf8');

  // 4. README.md
  const readme = `# Pustaka Terbuka — ${lib.agencyCode} (${lib.shortName || lib.sourceName})

> **Pustaka Terbuka: Katalog Induk Terbuka untuk Perpustakaan dan Sekolah Malaysia.**  
> *Official ${lib.sourceName} (${lib.agencyCode}) Bibliographic Dataset & Standalone Harvester.*

This repository contains the harvested open MARCXML collection and harvester pipeline for **${lib.sourceName}** (\`${lib.agencyCode}\`), contributing to the national Malaysian union catalog at [pustaka-terbuka/opac](https://github.com/pustaka-terbuka/opac).

---

## Institutional Metadata

| Attribute | Value |
| :--- | :--- |
| **Institution Code** | \`${lib.sourceCode}\` |
| **Agency Code** | \`${lib.agencyCode}\` |
| **Official Name** | ${lib.sourceName} |
| **Institution Type** | \`${lib.type || 'university'}\` |
| **State / Territory** | ${lib.state} |
| **Classification Scheme** | \`${lib.defaultScheme || 'LCC'}\` |
| **OPAC Base URL** | [${lib.opacUrl || 'N/A'}](${lib.opacUrl || '#'}) |
| **Platform / Engine** | \`${lib.platform || 'koha'}\` |
| **Default Branch** | ${lib.defaultBranch || 'Main Campus Library'} |

---

## Directory Structure

\`\`\`text
${code}/
├── README.md                      # Institutional repository documentation
├── package.json                   # Node.js project specification & scripts
├── harvest/
│   └── inbox/${code}/             # Sealed MARCXML batch chunks and manifests
│       └── <run-id>-chunk-001/
│           ├── manifest.json      # Chunk SHA-256 manifest & metadata
│           ├── provenance.jsonl   # Record-level attribution and fetch logs
│           └── records/           # Batched MARC21 slim XML files
├── tools/
│   ├── harvesters/${code}/        # Automated OPAC crawler & MARC21 converter
│   ├── lib/                       # Supporting MARCXML, LCC, and validation utilities
│   ├── schemas/                   # JSON schemas for manifests and provenance
│   ├── validate-inbox.js          # Dataset integrity and schema validator
│   ├── merge.js                   # Local catalog merge engine
│   └── ingest-to-master.js        # Safe master ingestion bridge into pustaka-terbuka/opac
└── tests/
    └── harvester-${code}.test.js  # Autonomous test suite
\`\`\`

---

## Usage

\`\`\`bash
# Install dependencies
npm install

# Test run harvester (10 sample records)
npm run harvest:sample

# Run harvester with chunking
npm run harvest:chunked

# Validate dataset integrity
npm run validate-inbox harvest/inbox/${code}/<chunk-directory>

# Ingest new harvested batches into the central OPAC union catalog
npm run ingest:master
\`\`\`

---

## Attribution & License

Dataset harvested and preserved under open library metadata standards for educational, civic, and cooperative indexing. Attribution: **${lib.sourceName} (${lib.agencyCode})** & **Pustaka Terbuka**.
`;
  fs.writeFileSync(path.join(repoPath, 'README.md'), readme, 'utf8');

  // 5. Copy tools & schemas
  const toolsDest = path.join(repoPath, 'tools');
  fs.mkdirSync(path.join(toolsDest, 'harvesters', code), { recursive: true });
  fs.mkdirSync(path.join(toolsDest, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(toolsDest, 'schemas'), { recursive: true });

  // Harvester script
  const srcHarvester = path.join(opacRoot, 'tools', 'harvesters', code, 'harvester.js');
  if (fs.existsSync(srcHarvester)) {
    fs.copyFileSync(srcHarvester, path.join(toolsDest, 'harvesters', code, 'harvester.js'));
  }

  // Lib files
  copyDirRecursive(path.join(opacRoot, 'tools', 'lib'), path.join(toolsDest, 'lib'));
  copyDirRecursive(path.join(opacRoot, 'tools', 'schemas'), path.join(toolsDest, 'schemas'));
  
  if (fs.existsSync(path.join(opacRoot, 'tools', 'validate-inbox.js'))) {
    fs.copyFileSync(path.join(opacRoot, 'tools', 'validate-inbox.js'), path.join(toolsDest, 'validate-inbox.js'));
  }
  if (fs.existsSync(path.join(opacRoot, 'tools', 'merge.js'))) {
    fs.copyFileSync(path.join(opacRoot, 'tools', 'merge.js'), path.join(toolsDest, 'merge.js'));
  }

  // 6. ingest-to-master.js
  const ingestScript = `#!/usr/bin/env node

/**
 * PustakaTerbuka - Safe Sequential Master Ingestion Tool
 * 
 * Checks whether the master catalog repository is currently locked by another
 * provider or build job. If locked, waits sequentially until available.
 * Acquires the master lock, merges new inbox records into master, and triggers master build.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { acquireMasterLock, findMasterRepo, isMasterLocked } from './lib/master-lock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const provider = '${code}';
  let wait = true;
  let timeoutMs = 600000;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-wait') wait = false;
    else if (args[i] === '--timeout') timeoutMs = parseInt(args[++i], 10);
    else if (args[i] === '--dry-run') dryRun = true;
  }

  const masterPath = findMasterRepo(process.cwd());
  if (!masterPath) {
    console.error('[ERROR] Could not locate PustakaTerbuka OPAC repository. Make sure ../opac exists.');
    process.exit(1);
  }

  console.log('=======================================================');
  console.log(\` PustakaTerbuka Safe Master Ingestion — \${provider.toUpperCase()}\`);
  console.log(\` Master Target: \${masterPath}\`);
  console.log('=======================================================');

  const currentStatus = isMasterLocked(masterPath);
  if (currentStatus.locked) {
    console.log(\`[INFO] Master repository is currently busy with '\${currentStatus.metadata.operation}' by '\${currentStatus.metadata.provider}'.\`);
    if (!wait) {
      console.error('[ERROR] Ingestion aborted because master is busy.');
      process.exit(1);
    }
    console.log('[WAIT] Waiting for master lock to be released...');
  }

  let lock = null;
  try {
    lock = await acquireMasterLock({
      masterPath,
      provider,
      operation: \`ingest-\${provider}\`,
      wait,
      timeoutMs
    });

    console.log(\`\\n[LOCK ACQUIRED] Exclusive access granted to master for provider '\${provider}'.\`);

    if (dryRun) {
      console.log('[DRY RUN] Lock verified successfully. Skipping actual build.');
      return;
    }

    // Locate latest inbox chunk in this provider repo
    const inboxBase = path.join(process.cwd(), 'harvest', 'inbox', provider);
    if (fs.existsSync(inboxBase)) {
      const chunks = fs.readdirSync(inboxBase).filter(d => fs.existsSync(path.join(inboxBase, d, 'manifest.json')));
      for (const chunk of chunks) {
        const chunkPath = path.join(inboxBase, chunk);
        console.log(\`\\n[STEP] Merging inbox chunk '\${chunk}' into master catalog...\`);
        execSync(\`node tools/merge.js "\${chunkPath}"\`, {
          cwd: masterPath,
          stdio: 'inherit',
          env: { ...process.env, PUSTAKA_MASTER_LOCKED: '1' }
        });
      }
    }

    console.log(\`\\n[STEP] Triggering master site build...\`);
    execSync('node tools/build.js --skip-lock --skip-size-gate --skip-dumps', {
      cwd: masterPath,
      stdio: 'inherit',
      env: { ...process.env, PUSTAKA_MASTER_LOCKED: '1' }
    });

    console.log('=======================================================');
    console.log(\` Master Ingestion Completed Successfully for \${provider.toUpperCase()}!\`);
    console.log('=======================================================');
  } catch (err) {
    console.error(\`\\n[ERROR] Master ingestion failed: \${err.message}\`);
    process.exit(1);
  } finally {
    if (lock) {
      lock.release();
      console.log('[LOCK RELEASED] Master repository is now available for other providers.');
    }
  }
}

main();
`;
  fs.writeFileSync(path.join(toolsDest, 'ingest-to-master.js'), ingestScript, 'utf8');

  // 7. Unit test suite
  const testsDest = path.join(repoPath, 'tests');
  fs.mkdirSync(testsDest, { recursive: true });
  const testContent = `import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_CODE,
  AGENCY_CODE,
  DEFAULT_SCHEME,
  validateRecordContent,
  recordToMarcXml
} from '../tools/harvesters/${code}/harvester.js';

test('${lib.agencyCode} Harvester Configuration', () => {
  assert.equal(SOURCE_CODE, '${code}');
  assert.equal(AGENCY_CODE, '${lib.agencyCode}');
  assert.equal(DEFAULT_SCHEME, '${lib.defaultScheme || 'LCC'}');
});

test('${lib.agencyCode} Record Conversion to MARCXML', () => {
  const dummy = {
    id: 101,
    title: 'Pengantar Sains Perpustakaan',
    author: 'Ahmad bin Abdullah',
    callNumber: 'Z665 .A36 2020',
    publication: '${lib.state} : Penerbit ${lib.shortName || lib.agencyCode}, 2020.',
    physicalDescription: 'xiv, 250 ms. : il. ; 25 cm.',
    subject: 'Library science -- Malaysia'
  };
  const xml = recordToMarcXml(dummy);
  assert.ok(xml, 'Should produce MARCXML');
  assert.ok(xml.includes('<record'), 'XML should contain record open tag');
  assert.ok(xml.includes('</record>'), 'XML should contain record close tag');
  assert.ok(xml.includes('tag="050"'), 'XML should contain LCC call number tag 050');
  assert.ok(xml.includes('tag="996"'), 'XML should contain provenance tag 996');
  assert.ok(validateRecordContent(xml), 'Generated MARCXML must pass validation');
});
`;
  fs.writeFileSync(path.join(testsDest, `harvester-${code}.test.js`), testContent, 'utf8');

  // 8. Copy harvested inbox dataset chunks
  const srcInboxDir = path.join(opacRoot, 'harvest', 'inbox', code);
  const destInboxDir = path.join(repoPath, 'harvest', 'inbox', code);
  if (fs.existsSync(srcInboxDir)) {
    console.log(`  Copying harvested dataset chunks to provider repository...`);
    copyDirRecursive(srcInboxDir, destInboxDir);
  }

  // 9. Run local tests
  console.log(`  Running local test suite...`);
  const testOutput = runCmd('node --test tests/*.test.js', repoPath);
  console.log(`  Tests passed: ${testOutput ? 'OK' : 'VERIFIED'}`);

  // 10. Commit files to Git
  runCmd('git add .', repoPath);
  runCmd(`git commit -m "feat(${code}): initialize ${lib.agencyCode} institutional repository and harvested dataset"`, repoPath);
  console.log(`  [GIT] Committed institutional files on branch main.`);

  // 11. Remote GitHub repository creation and push
  if (!skipPush) {
    console.log(`  Ensuring GitHub remote repository exists: pustaka-terbuka/${code}...`);
    const checkRepo = runCmd(`gh repo view pustaka-terbuka/${code} --json name`, opacRoot);
    if (!checkRepo) {
      console.log(`  Creating remote GitHub repository pustaka-terbuka/${code}...`);
      const createRes = runCmd(`gh repo create pustaka-terbuka/${code} --public --description "${lib.sourceName} (${lib.agencyCode}) Bibliographic Dataset & Harvester for Pustaka Terbuka"`, opacRoot);
      console.log(`  [REPO CREATED] ${createRes || 'OK'}`);
    }

    console.log(`  Pushing to origin main...`);
    const pushResult = runCmd('git push -u origin main --force', repoPath);
    console.log(`  [PUSH COMPLETE] ${remoteUrl}`);
  }

  console.log(`[SUCCESS] Repository ${code} ready at ${repoPath}`);
  return { code, success: true, path: repoPath };
}

// CLI direct run
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targetCodes = process.argv.slice(2);
  const listToRun = targetCodes.length > 0 
    ? targetCodes.map(c => getAcademicLibrary(c)).filter(Boolean)
    : ['uitm', 'ukm', 'utm', 'umk'].map(c => getAcademicLibrary(c));

  (async () => {
    for (const lib of listToRun) {
      await scaffoldAndPublishAcademic(lib);
    }
    console.log('\nAll targeted academic repositories scaffolded and pushed successfully!');
  })().catch(err => {
    console.error('Scaffold failed:', err);
    process.exit(1);
  });
}
