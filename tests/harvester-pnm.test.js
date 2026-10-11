import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { runHarvest, parseArgs } from '../tools/harvesters/pnm/harvester.js';
import { validateInbox } from '../tools/validate-inbox.js';
import { findMasterRepo, isMasterLocked } from '../tools/lib/master-lock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('PNM Harvester Node module exports runHarvest and handles --help', async () => {
  const code = await runHarvest(['--help']);
  assert.strictEqual(code, 0);
});

test('PNM Harvester handles --chunk-size and --master-digest CLI flags', () => {
  const parsedDefault = parseArgs([]);
  assert.strictEqual(parsedDefault.chunkSize, 10000, 'Default chunk size must be 10,000 records');
  assert.strictEqual(parsedDefault.ingestMaster, false, 'Default ingestMaster should be false');

  const parsedCustom = parseArgs(['--chunk-size', '5000', '--master-digest']);
  assert.strictEqual(parsedCustom.chunkSize, 5000, 'Chunk size must match CLI argument');
  assert.strictEqual(parsedCustom.ingestMaster, true, '--master-digest must enable ingestMaster');

  const parsedIngest = parseArgs(['--ingest-master']);
  assert.strictEqual(parsedIngest.ingestMaster, true, '--ingest-master must enable ingestMaster');
});

test('Discrete 10k lifecycle chunk passes validateInbox schema check', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnm-chunk-test-'));
  const chunkRunId = '20261011-120000Z-chunk-001';
  const chunkDir = path.join(tmpDir, 'harvest', 'inbox', 'pnm', chunkRunId);
  const recordsDir = path.join(chunkDir, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<collection xmlns="http://www.loc.gov/MARC21/slim">
  <record>
    <leader>00000nam a2200000Ia 4500</leader>
    <controlfield tag="001">vtls000437338</controlfield>
    <datafield tag="245" ind1="0" ind2="0">
      <subfield code="a">Asas Sains Komputer Tingkatan 1</subfield>
    </datafield>
  </record>
</collection>`;
  fs.writeFileSync(path.join(recordsDir, 'batch_0.xml'), sampleXml, 'utf8');

  const prov = {
    source_001: 'vtls000437338',
    source_url: 'https://opac.pnm.gov.my/search/resource/12345',
    harvested_at: new Date().toISOString(),
    file: 'batch_0.xml',
    index: 0
  };
  fs.writeFileSync(path.join(chunkDir, 'provenance.jsonl'), JSON.stringify(prov) + '\n', 'utf8');

  const manifest = {
    schema_version: '1.0',
    source_code: 'pnm',
    source_name: 'Perpustakaan Negara Malaysia',
    source_base_url: 'https://opac.pnm.gov.my/',
    terms_url: 'https://www.pnm.gov.my/',
    terms_verified_on: '2026-10-11',
    harvester_name: 'pnm-vega-scraper-node',
    harvester_version: '1.0.0',
    run_id: chunkRunId,
    mode: 'full',
    started_at: '2026-10-11T12:00:00.000Z',
    finished_at: '2026-10-11T12:15:00.000Z',
    record_count: 1,
    error_count: 0,
    status: 'complete',
    user_agent: 'PustakaTerbuka Harvester',
    notes: 'Harvest chunk 1 completed successfully.'
  };
  fs.writeFileSync(path.join(chunkDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const res = await validateInbox(chunkDir, { skipDropGate: true });
  assert.strictEqual(res.valid, true, `Expected valid chunk, got errors: ${res.errors.join(', ')}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Existing PNM harvest inbox batch passes validation', async () => {
  const pnmBatchDir = path.join(__dirname, '..', 'harvest', 'inbox', 'pnm', '2026-10-07T13-16-01-932Z');
  if (fs.existsSync(pnmBatchDir)) {
    const res = await validateInbox(pnmBatchDir, { skipDropGate: true });
    assert.strictEqual(res.valid, true, `Expected valid inbox batch, got errors: ${res.errors.join(', ')}`);
  }
});

test('Master sequential lock utility can find master repo and reports unlocked', () => {
  const masterPath = findMasterRepo(process.cwd());
  assert.ok(masterPath, 'Must locate master repo');
  const status = isMasterLocked(masterPath);
  assert.strictEqual(status.locked, false, 'Master repo should be unlocked when idle');
});
