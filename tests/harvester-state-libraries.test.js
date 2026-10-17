import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Import all state library harvesters
import * as ppaj from '../tools/harvesters/ppaj/harvester.js';
import * as ppak from '../tools/harvesters/ppak/harvester.js';
import * as ppank from '../tools/harvesters/ppank/harvester.js';
import * as perpustam from '../tools/harvesters/perpustam/harvester.js';
import * as ppans from '../tools/harvesters/ppans/harvester.js';
import * as ppap from '../tools/harvesters/ppap/harvester.js';
import * as ppanpk from '../tools/harvesters/ppanpk/harvester.js';
import * as ppanps from '../tools/harvesters/ppanps/harvester.js';
import * as ssl from '../tools/harvesters/ssl/harvester.js';
import * as sarawak from '../tools/harvesters/sarawak/harvester.js';
import * as ppat from '../tools/harvesters/ppat/harvester.js';
import * as pkl from '../tools/harvesters/pkl/harvester.js';

const stateHarvesters = [
  { mod: ppaj, code: 'ppaj', name: 'Johor (PPAJ)' },
  { mod: ppak, code: 'ppak', name: 'Kedah (PPAK)' },
  { mod: ppank, code: 'ppank', name: 'Kelantan (PPANK)' },
  { mod: perpustam, code: 'perpustam', name: 'Melaka (PERPUSTAM)' },
  { mod: ppans, code: 'ppans', name: 'Negeri Sembilan (PPANS)' },
  { mod: ppap, code: 'ppap', name: 'Pahang (PPAP)' },
  { mod: ppanpk, code: 'ppanpk', name: 'Perak (PPANPK)' },
  { mod: ppanps, code: 'ppanps', name: 'Perlis (PPANPS)' },
  { mod: ssl, code: 'ssl', name: 'Sabah (SSL)' },
  { mod: sarawak, code: 'sarawak', name: 'Sarawak (SARAWAK)' },
  { mod: ppat, code: 'ppat', name: 'Terengganu (PPAT)' },
  { mod: pkl, code: 'pkl', name: 'Kuala Lumpur (PKL)' }
];

test('State Library Harvesters Universal Verification Suite', async (t) => {
  for (const item of stateHarvesters) {
    const { mod, code, name } = item;

    await t.test(`${name} - CLI argument parsing`, () => {
      const opts = mod.parseArgs(['--start-bib', '50', '--end-bib', '150', '--delay', '1200', '--max-records', '20']);
      assert.strictEqual(opts.startBib, 50);
      assert.strictEqual(opts.endBib, 150);
      assert.strictEqual(opts.delayMs, 1200);
      assert.strictEqual(opts.maxRecords, 20);
    });

    await t.test(`${name} - Validates mandatory MARC tags (001 and 245)`, () => {
      const valid = '<record><controlfield tag="001">999</controlfield><datafield tag="245"><subfield code="a">Buku Ujian</subfield></datafield></record>';
      const no001 = '<record><datafield tag="245"><subfield code="a">Buku Ujian</subfield></datafield></record>';
      const no245 = '<record><controlfield tag="001">999</controlfield></record>';

      assert.strictEqual(mod.validateRecordContent(valid), true);
      assert.strictEqual(mod.validateRecordContent(no001), false);
      assert.strictEqual(mod.validateRecordContent(no245), false);
    });

    await t.test(`${name} - Generates valid MARCXML record with institutional provenance`, () => {
      const sample = {
        id: '123456',
        title: 'Sejarah Malaysia',
        author: 'Zainal Abidin',
        isbn: '9789831234567',
        ddc: '959.5',
        publisher: 'Dewan Bahasa dan Pustaka',
        year: '2020'
      };

      const xml = mod.recordToMarcXml(sample);
      assert.ok(xml, 'XML should be produced');
      assert.strictEqual(mod.validateRecordContent(xml), true);
      assert.ok(xml.includes('<controlfield tag="001">123456</controlfield>'), 'Has controlfield 001');
      assert.ok(xml.includes(`tag="003">${mod.AGENCY_CODE}</controlfield>`), `Has agency code ${mod.AGENCY_CODE}`);
      assert.ok(xml.includes('<subfield code="a">Sejarah Malaysia</subfield>'), 'Has title');
      assert.ok(xml.includes(`tag="996" ind1=" " ind2=" "><subfield code="a">${code}</subfield>`), `Has 996 source code ${code}`);
    });

    await t.test(`${name} - Self-heals corrupted XML batches and repairs provenance`, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `test-${code}-`));
      const recordsDir = path.join(tmpDir, 'records');
      fs.mkdirSync(recordsDir, { recursive: true });

      // Valid batch
      fs.writeFileSync(path.join(recordsDir, 'batch_0.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record><controlfield tag="001">1</controlfield><datafield tag="245"><subfield code="a">Test</subfield></datafield></record></collection>', 'utf8');
      // Corrupted batch (missing closing collection tag)
      fs.writeFileSync(path.join(recordsDir, 'batch_1.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record><controlfield tag="001">2</controlfield>', 'utf8');

      const inspected = mod.inspectBatches(recordsDir);
      assert.strictEqual(inspected.highestPage, 0);
      assert.strictEqual(inspected.validBatches.has('batch_0.xml'), true);
      assert.strictEqual(inspected.validBatches.has('batch_1.xml'), false);
      assert.strictEqual(fs.existsSync(path.join(recordsDir, 'batch_1.xml')), false, 'Corrupted batch should be removed');

      // Test repairProvenance
      const provPath = path.join(tmpDir, 'provenance.jsonl');
      const provLines = [
        JSON.stringify({ source_001: '1', file: 'batch_0.xml', index: 0 }),
        JSON.stringify({ source_001: '2', file: 'batch_1.xml', index: 0 })
      ].join('\n') + '\n';
      fs.writeFileSync(provPath, provLines, 'utf8');

      mod.repairProvenance(provPath, inspected.validBatches);
      const repaired = fs.readFileSync(provPath, 'utf8');
      assert.ok(repaired.includes('batch_0.xml'), 'Retains valid batch entry');
      assert.ok(!repaired.includes('batch_1.xml'), 'Purges corrupt batch entry');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    await t.test(`${name} - Handles --help gracefully`, async () => {
      const codeResult = await mod.runHarvest({ help: true });
      assert.strictEqual(codeResult, 0);
    });
  }
});
