import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  validateRecordContent,
  formatGroupToMarcXml,
  inspectBatches,
  generatePartitionPlan,
  repairProvenance,
  runHarvest
} from '../tools/harvesters/ppas/harvester.js';

test('PPAS Harvester handles CLI argument parsing', () => {
  const args = ['--page-size', '50', '--chunk-size', '5000', '--delay', '1000', '--max-records', '25', '--master-digest'];
  const opts = parseArgs(args);
  assert.strictEqual(opts.pageSize, 50);
  assert.strictEqual(opts.chunkSize, 5000);
  assert.strictEqual(opts.delayMs, 1000);
  assert.strictEqual(opts.maxRecords, 25);
  assert.strictEqual(opts.ingestMaster, true);
});

test('PPAS Harvester validates mandatory MARC tags (001 and 245)', () => {
  const validXml = '<record><controlfield tag="001">123</controlfield><datafield tag="245"><subfield code="a">Title</subfield></datafield></record>';
  const missing001 = '<record><datafield tag="245"><subfield code="a">Title</subfield></datafield></record>';
  const missing245 = '<record><controlfield tag="001">123</controlfield></record>';

  assert.strictEqual(validateRecordContent(validXml), true);
  assert.strictEqual(validateRecordContent(missing001), false);
  assert.strictEqual(validateRecordContent(missing245), false);
});

test('PPAS Harvester converts Vega FormatGroup item to valid MARCXML', () => {
  const sampleItem = {
    id: "303b0eba-9591-5204-b4e7-b0169210177d",
    title: "Buat duit di kampus",
    publicationDate: "2010",
    language: "may",
    primaryAgent: {
      label: "Soolehatulmuthyah Jantan, 1987-"
    },
    identifiers: {
      isbn: "9789675428449",
      local: "vtls000410105"
    },
    materialTabs: [
      {
        name: "Book",
        recordIds: ["131007"],
        editions: [
          {
            callNumber: "658.314",
            edition: "Edisi Pertama"
          }
        ],
        locations: [
          {
            code: "55",
            label: "Cawangan Kajang",
            availabilityStatus: "Available"
          }
        ]
      }
    ]
  };

  const xml = formatGroupToMarcXml(sampleItem);
  assert.ok(xml, 'XML should be generated');
  assert.ok(validateRecordContent(xml), 'Generated XML must pass validation');
  assert.ok(xml.includes('<controlfield tag="001">131007</controlfield>'), 'Should have localId 131007');
  assert.ok(xml.includes('<controlfield tag="003">PPAS</controlfield>'), 'Should have PPAS agency code');
  assert.ok(xml.includes('<subfield code="a">Buat duit di kampus</subfield>'), 'Should contain title');
  assert.ok(xml.includes('<subfield code="a">Soolehatulmuthyah Jantan, 1987-</subfield>'), 'Should contain author');
  assert.ok(xml.includes('<subfield code="a">9789675428449</subfield>'), 'Should contain ISBN');
  assert.ok(xml.includes('<subfield code="a">658.314</subfield>'), 'Should contain DDC call number');
  assert.ok(xml.includes('<subfield code="a">ppas</subfield>'), 'Should contain source tag 996 ppas');
});

test('PPAS Harvester generates complete partition plan under 10k window', () => {
  const plan = generatePartitionPlan();
  assert.ok(plan.length > 40, 'Partition plan should have comprehensive buckets');
  const has2024 = plan.some(p => p.name === 'year_2024' && p.dateFrom === 2024);
  assert.ok(has2024, 'Plan must include year_2024');
});

test('PPAS Harvester inspectBatches self-heals corrupted XML batches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppas-test-'));
  const recordsDir = path.join(tmpDir, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  // Valid batch
  fs.writeFileSync(path.join(recordsDir, 'batch_0.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record><controlfield tag="001">1</controlfield><datafield tag="245"><subfield code="a">Test</subfield></datafield></record></collection>', 'utf8');
  // Corrupt batch (missing closing collection tag)
  fs.writeFileSync(path.join(recordsDir, 'batch_1.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record></record>', 'utf8');

  const inspected = inspectBatches(recordsDir);
  assert.strictEqual(inspected.highestPage, 0);
  assert.strictEqual(inspected.validBatches.has('batch_0.xml'), true);
  assert.strictEqual(inspected.validBatches.has('batch_1.xml'), false);
  assert.strictEqual(fs.existsSync(path.join(recordsDir, 'batch_1.xml')), false, 'Corrupt batch file should be removed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('PPAS Harvester handles --help gracefully', async () => {
  const code = await runHarvest(['--help']);
  assert.strictEqual(code, 0);
});
