import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const opacDir = path.join(rootDir, 'opac');

const stateLibraries = [
  { code: 'ppaj', org: 'PPAJ', name: 'Perbadanan Perpustakaan Awam Johor', state: 'Johor', opacUrl: 'https://ppaj.johor.gov.my/', priority: 7 },
  { code: 'ppak', org: 'PPAK', name: 'Perbadanan Perpustakaan Awam Kedah', state: 'Kedah', opacUrl: 'https://www.kedahlib.gov.my/', priority: 8 },
  { code: 'ppank', org: 'PPANK', name: 'Perbadanan Perpustakaan Awam Kelantan', state: 'Kelantan', opacUrl: 'http://catalog.kelantanlibrary.gov.my/', priority: 8 },
  { code: 'perpustam', org: 'PERPUSTAM', name: 'Perbadanan Perpustakaan Awam Melaka', state: 'Melaka', opacUrl: 'https://perpustam.gov.my/', priority: 7 },
  { code: 'ppans', org: 'PPANS', name: 'Perbadanan Perpustakaan Awam Negeri Sembilan', state: 'Negeri Sembilan', opacUrl: 'https://www.nslibrary.gov.my/', priority: 7 },
  { code: 'ppap', org: 'PPAP', name: 'Perbadanan Perpustakaan Awam Pahang', state: 'Pahang', opacUrl: 'https://webopac.pahanglibrary.gov.my/', priority: 7 },
  { code: 'ppanpk', org: 'PPANPK', name: 'Perbadanan Perpustakaan Awam Negeri Perak', state: 'Perak', opacUrl: 'https://pintar.ppanpk.gov.my/', priority: 8 },
  { code: 'ppanps', org: 'PPANPS', name: 'Perbadanan Perpustakaan Awam Negeri Perlis', state: 'Perlis', opacUrl: 'http://opac.perlislib.gov.my/', priority: 7 },
  { code: 'ssl', org: 'SSL', name: 'Perpustakaan Negeri Sabah', state: 'Sabah', opacUrl: 'https://library.sabah.gov.my/', priority: 7 },
  { code: 'sarawak', org: 'SARAWAK', name: 'Pustaka Negeri Sarawak', state: 'Sarawak', opacUrl: 'https://www.librarynet.com.my/', priority: 8 },
  { code: 'ppat', org: 'PPAT', name: 'Perbadanan Perpustakaan Awam Terengganu', state: 'Terengganu', opacUrl: 'https://www.trglib.gov.my/', priority: 7 },
  { code: 'pkl', org: 'PKL', name: 'Perpustakaan Kuala Lumpur', state: 'Kuala Lumpur', opacUrl: 'https://perpustakaankualalumpur.dbkl.gov.my/', priority: 8 }
];

function copyDirRecursive(src, dest) {
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

for (const lib of stateLibraries) {
  const repoPath = path.join(rootDir, lib.code);
  console.log(`\n=======================================================`);
  console.log(` Scaffolding repository: ${lib.code} (${lib.name})`);
  console.log(` Target: ${repoPath}`);
  console.log(`=======================================================`);

  fs.mkdirSync(repoPath, { recursive: true });

  // 1. Initialize Git repository if not present
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    execSync('git init -b main', { cwd: repoPath, stdio: 'ignore' });
    try {
      execSync(`git remote add origin https://github.com/pustaka-terbuka/${lib.code}.git`, { cwd: repoPath, stdio: 'ignore' });
    } catch {}
  }

  // 2. package.json
  const pkg = {
    name: `pustaka-terbuka-${lib.code}`,
    version: '0.1.0',
    description: `${lib.name} (${lib.org}) Bibliographic Dataset and Harvester for Pustaka Terbuka.`,
    type: 'module',
    scripts: {
      test: 'node --test tests/*.test.js',
      'validate-inbox': 'node tools/validate-inbox.js',
      merge: 'node tools/merge.js',
      harvest: `node tools/harvesters/${lib.code}/harvester.js`,
      'harvest:sample': `node tools/harvesters/${lib.code}/harvester.js --max-records 10`,
      'harvest:chunked': `node tools/harvesters/${lib.code}/harvester.js --chunk-size 10000`,
      'harvest:master': `node tools/harvesters/${lib.code}/harvester.js --chunk-size 10000 --master-digest`,
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

  // 3. README.md
  const readme = `# Pustaka Terbuka — ${lib.org} Data Provider

> **PustakaTerbuka: an open, shared MARC catalog for Malaysian schools and libraries.**  
> *Official ${lib.name} (${lib.org}) Bibliographic Dataset and Harvester.*

This repository contains the MARCXML bibliographic catalog harvested from **${lib.name} (${lib.org})** for consumption by the Pustaka Terbuka Union Catalog ([pustaka-terbuka/opac](https://github.com/pustaka-terbuka/opac)).

---

## Catalog Overview

- **Source Code:** \`${lib.code}\`
- **Organization:** ${lib.name}
- **Source Priority:** ${lib.priority}
- **State:** ${lib.state}
- **OPAC Portal:** \`${lib.opacUrl}\`

---

## Harvesting & Integration

The collection is harvested following Pustaka Terbuka Harvester Standards and Decision D005 Chunk Lifecycle.

- \`tools/harvesters/${lib.code}/harvester.js\` — Harvester engine with rate-limiting, backoff, and self-healing resumption.
- \`harvest/inbox/${lib.code}/\` — Intake directory for harvested batches (\`manifest.json\`, \`records/*.xml\`, \`provenance.jsonl\`).

### Quick Start

To run a sample harvest:
\`\`\`bash
npm run harvest:sample
\`\`\`

To run a chunked harvest (10,000 records per chunk):
\`\`\`bash
npm run harvest:chunked
\`\`\`

To run a chunked harvest with automatic Master Digest ingestion:
\`\`\`bash
npm run harvest:master
\`\`\`
`;
  fs.writeFileSync(path.join(repoPath, 'README.md'), readme, 'utf8');

  // 4. Copy tools
  const toolsDest = path.join(repoPath, 'tools');
  fs.mkdirSync(toolsDest, { recursive: true });
  copyDirRecursive(path.join(opacDir, 'tools/lib'), path.join(toolsDest, 'lib'));
  copyDirRecursive(path.join(opacDir, 'tools/schemas'), path.join(toolsDest, 'schemas'));
  fs.copyFileSync(path.join(opacDir, 'tools/validate-inbox.js'), path.join(toolsDest, 'validate-inbox.js'));
  fs.copyFileSync(path.join(opacDir, 'tools/merge.js'), path.join(toolsDest, 'merge.js'));

  // Copy ingest-to-master.js from ppapp
  const ingestSrc = path.join(rootDir, 'ppapp/tools/ingest-to-master.js');
  if (fs.existsSync(ingestSrc)) {
    fs.copyFileSync(ingestSrc, path.join(toolsDest, 'ingest-to-master.js'));
  }

  // 5. Harvester script
  const harvesterSrc = path.join(opacDir, `tools/harvesters/${lib.code}/harvester.js`);
  const harvesterDestDir = path.join(toolsDest, `harvesters/${lib.code}`);
  fs.mkdirSync(harvesterDestDir, { recursive: true });
  fs.copyFileSync(harvesterSrc, path.join(harvesterDestDir, 'harvester.js'));

  // 6. Test file
  const testDest = path.join(repoPath, 'tests');
  fs.mkdirSync(testDest, { recursive: true });
  const testContent = `import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  parseArgs,
  validateRecordContent,
  inspectBatches,
  repairProvenance,
  recordToMarcXml,
  runHarvest
} from '../tools/harvesters/${lib.code}/harvester.js';

test('${lib.org} Harvester handles CLI argument parsing', () => {
  const args = ['--start-bib', '100', '--end-bib', '200', '--delay', '1500', '--max-records', '50'];
  const opts = parseArgs(args);
  assert.strictEqual(opts.startBib, 100);
  assert.strictEqual(opts.endBib, 200);
  assert.strictEqual(opts.delayMs, 1500);
  assert.strictEqual(opts.maxRecords, 50);
});

test('${lib.org} Harvester validates mandatory MARC tags (001 and 245)', () => {
  const validXml = '<record><controlfield tag="001">123</controlfield><datafield tag="245"><subfield code="a">Title</subfield></datafield></record>';
  const missing001 = '<record><datafield tag="245"><subfield code="a">Title</subfield></datafield></record>';
  const missing245 = '<record><controlfield tag="001">123</controlfield></record>';

  assert.strictEqual(validateRecordContent(validXml), true);
  assert.strictEqual(validateRecordContent(missing001), false);
  assert.strictEqual(validateRecordContent(missing245), false);
});

test('${lib.org} Harvester generates valid MARCXML record', () => {
  const sample = { id: '777', title: 'Buku Contoh', author: 'Penulis', isbn: '9789830000000', ddc: '100' };
  const xml = recordToMarcXml(sample);
  assert.ok(xml);
  assert.strictEqual(validateRecordContent(xml), true);
  assert.ok(xml.includes('<controlfield tag="001">777</controlfield>'));
  assert.ok(xml.includes('<subfield code="a">${lib.code}</subfield>'));
});

test('${lib.org} Harvester inspectBatches self-heals corrupted XML batches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '${lib.code}-test-'));
  const recordsDir = path.join(tmpDir, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  fs.writeFileSync(path.join(recordsDir, 'batch_0.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record><controlfield tag="001">1</controlfield><datafield tag="245"><subfield code="a">Test</subfield></datafield></record></collection>', 'utf8');
  fs.writeFileSync(path.join(recordsDir, 'batch_1.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record></record>', 'utf8');

  const inspected = inspectBatches(recordsDir);
  assert.strictEqual(inspected.highestPage, 0);
  assert.strictEqual(inspected.validBatches.has('batch_0.xml'), true);
  assert.strictEqual(inspected.validBatches.has('batch_1.xml'), false);
  assert.strictEqual(fs.existsSync(path.join(recordsDir, 'batch_1.xml')), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('${lib.org} Harvester handles --help gracefully', async () => {
  const code = await runHarvest({ help: true });
  assert.strictEqual(code, 0);
});
`;
  fs.writeFileSync(path.join(testDest, `harvester-${lib.code}.test.js`), testContent, 'utf8');

  // 7. data/sources.json
  const dataDir = path.join(repoPath, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const sourcesEntry = {
    [lib.code]: {
      name: lib.name,
      prefix: lib.org,
      priority: lib.priority,
      organization: lib.org,
      opacUrl: lib.opacUrl
    }
  };
  fs.writeFileSync(path.join(dataDir, 'sources.json'), JSON.stringify(sourcesEntry, null, 2), 'utf8');

  // 8. harvest/inbox
  const inboxDir = path.join(repoPath, 'harvest/inbox', lib.code);
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.writeFileSync(path.join(inboxDir, '.gitkeep'), '', 'utf8');

  console.log(`[SUCCESS] Scaffolded repository for ${lib.code} at ${repoPath}`);
}

console.log('\nAll 12 state library repositories have been successfully scaffolded!');
