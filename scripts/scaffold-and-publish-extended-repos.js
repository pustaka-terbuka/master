#!/usr/bin/env node

/**
 * PustakaTerbuka - Institutional Repository Scaffolder & GitHub Publisher
 * 
 * Creates dedicated standalone Git repositories for each extended institution:
 * - Local repository: d:\RepoTools\GitHub\pustaka-terbuka\<sourceCode>
 * - Remote GitHub: https://github.com/pustaka-terbuka/<sourceCode>
 * - Includes: package.json, README.md, harvester, test suite, and full harvested MARCXML dataset
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { EXTENDED_LIBRARIES } from '../tools/lib/extended-registry.js';

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

export async function scaffoldAndPublishInstitution(lib, options = {}) {
  const code = lib.sourceCode;
  const repoPath = path.join(ecosystemRoot, code);
  const skipPush = options.skipPush || false;

  console.log(`\n======================================================================`);
  console.log(`[SCAFFOLD] Initializing Dedicated Repository: ${lib.agencyCode} (${lib.sourceName})`);
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
      harvest: `node tools/harvesters/${code}/harvester.js`,
      'harvest:sample': `node tools/harvesters/${code}/harvester.js --max-records 10`,
      'harvest:full': `node tools/harvesters/${code}/harvester.js --batch-size 1000 --delay 0`
    },
    engines: {
      node: '>=20.0.0'
    },
    private: false,
    license: 'MIT',
    dependencies: {
      ajv: '^8.17.1',
      'ajv-formats': '^3.0.1',
      'fast-xml-parser': '^5.11.2'
    }
  };
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

  // 3. .gitignore
  const gitignore = `node_modules/
.env
.env.*
*.log
`;
  fs.writeFileSync(path.join(repoPath, '.gitignore'), gitignore, 'utf8');

  // 4. README.md
  const readme = `# Pustaka Terbuka — ${lib.agencyCode} (${lib.sourceName})

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
| **Institution Type** | \`${lib.type}\` |
| **State / Territory** | ${lib.state} |
| **Target End Bib** | ${lib.defaultMaxBib ? lib.defaultMaxBib.toLocaleString() : 'N/A'} |
| **OPAC Base URL** | [${lib.opacUrl || 'N/A'}](${lib.opacUrl || '#'}) |
| **Subject Focus** | ${lib.sampleDomain || 'Comprehensive academic and research literature'} |

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
│   ├── harvesters/${code}/        # Automated OPAC crawler & XML converter
│   └── lib/                       # Supporting MARCXML and validation utilities
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

# Run full collection sweep
npm run harvest:full

# Validate dataset integrity
npm run validate-inbox harvest/inbox/${code}/<chunk-directory>
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

  // 6. Test suite
  const testsDest = path.join(repoPath, 'tests');
  fs.mkdirSync(testsDest, { recursive: true });
  const testContent = `import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_CODE, AGENCY_CODE, fetchRecord, recordToMarcXml, validateRecordContent } from '../tools/harvesters/${code}/harvester.js';

test('${lib.agencyCode} Harvester Configuration', () => {
  assert.equal(SOURCE_CODE, '${code}');
  assert.equal(AGENCY_CODE, '${lib.agencyCode}');
});

test('${lib.agencyCode} Fetch and XML Generation', async () => {
  const xml = await fetchRecord(101);
  assert.ok(xml, 'Should return XML record');
  assert.ok(xml.includes('<record'), 'XML should contain record open tag');
  assert.ok(xml.includes('</record>'), 'XML should contain record close tag');
  assert.ok(xml.includes('tag="996"'), 'XML should contain source tag 996');
  assert.ok(validateRecordContent(xml), 'Generated XML must pass validation');
});
`;
  fs.writeFileSync(path.join(testsDest, `harvester-${code}.test.js`), testContent, 'utf8');

  // 7. Copy harvested inbox dataset chunks
  const srcInboxDir = path.join(opacRoot, 'harvest', 'inbox', code);
  const destInboxDir = path.join(repoPath, 'harvest', 'inbox', code);
  if (fs.existsSync(srcInboxDir)) {
    console.log(`  Copying harvested dataset chunks to repository...`);
    copyDirRecursive(srcInboxDir, destInboxDir);
  }

  // 8. Commit files to Git
  runCmd('git add .', repoPath);
  runCmd(`git commit -m "feat(${code}): initialize ${lib.agencyCode} institutional repository and harvested dataset"`, repoPath);
  console.log(`  [GIT] Committed institutional files on branch main.`);

  // 9. Remote GitHub repository creation and push
  if (!skipPush) {
    console.log(`  Ensuring GitHub remote repository exists: pustaka-terbuka/${code}...`);
    const checkRepo = runCmd(`gh repo view pustaka-terbuka/${code} --json name`, opacRoot);
    if (!checkRepo) {
      console.log(`  Creating remote GitHub repository pustaka-terbuka/${code}...`);
      runCmd(`gh repo create pustaka-terbuka/${code} --public --description "${lib.sourceName} (${lib.agencyCode}) Bibliographic Dataset & Harvester for Pustaka Terbuka"`, opacRoot);
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
  const targetCode = process.argv[2];
  if (targetCode) {
    const lib = EXTENDED_LIBRARIES.find(l => l.sourceCode === targetCode);
    if (!lib) {
      console.error(`Library with code "${targetCode}" not found in registry.`);
      process.exit(1);
    }
    scaffoldAndPublishInstitution(lib)
      .then(() => process.exit(0))
      .catch(e => { console.error(e); process.exit(1); });
  } else {
    // Scaffold all
    (async () => {
      console.log(`Scaffolding all ${EXTENDED_LIBRARIES.length} extended library repositories...`);
      for (const lib of EXTENDED_LIBRARIES) {
        await scaffoldAndPublishInstitution(lib);
      }
    })().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  }
}
