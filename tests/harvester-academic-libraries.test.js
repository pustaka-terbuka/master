import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { ACADEMIC_LIBRARIES, getAcademicLibrary } from '../tools/lib/academic-registry.js';

// Import all 26 academic library harvesters
import * as um from '../tools/harvesters/um/harvester.js';
import * as usm from '../tools/harvesters/usm/harvester.js';
import * as ukm from '../tools/harvesters/ukm/harvester.js';
import * as upm from '../tools/harvesters/upm/harvester.js';
import * as utm from '../tools/harvesters/utm/harvester.js';
import * as uitm from '../tools/harvesters/uitm/harvester.js';
import * as iium from '../tools/harvesters/iium/harvester.js';
import * as uum from '../tools/harvesters/uum/harvester.js';
import * as unimas from '../tools/harvesters/unimas/harvester.js';
import * as ums from '../tools/harvesters/ums/harvester.js';
import * as upsi from '../tools/harvesters/upsi/harvester.js';
import * as usim from '../tools/harvesters/usim/harvester.js';
import * as umt from '../tools/harvesters/umt/harvester.js';
import * as uthm from '../tools/harvesters/uthm/harvester.js';
import * as utem from '../tools/harvesters/utem/harvester.js';
import * as umpsa from '../tools/harvesters/umpsa/harvester.js';
import * as unimap from '../tools/harvesters/unimap/harvester.js';
import * as unisza from '../tools/harvesters/unisza/harvester.js';
import * as umk from '../tools/harvesters/umk/harvester.js';
import * as upnm from '../tools/harvesters/upnm/harvester.js';
import * as utp from '../tools/harvesters/utp/harvester.js';
import * as mmu from '../tools/harvesters/mmu/harvester.js';
import * as uniten from '../tools/harvesters/uniten/harvester.js';
import * as utar from '../tools/harvesters/utar/harvester.js';
import * as sunway from '../tools/harvesters/sunway/harvester.js';
import * as taylors from '../tools/harvesters/taylors/harvester.js';

const academicModules = {
  um, usm, ukm, upm, utm, uitm, iium, uum, unimas, ums,
  upsi, usim, umt, uthm, utem, umpsa, unimap, unisza, umk, upnm,
  utp, mmu, uniten, utar, sunway, taylors
};

test('Academic Libraries Registry Integrity', () => {
  assert.strictEqual(ACADEMIC_LIBRARIES.length, 26, 'Registry must contain 26 academic libraries (20 UA + 6 premier IPTS)');
  
  for (const lib of ACADEMIC_LIBRARIES) {
    assert.ok(lib.sourceCode, 'Must have sourceCode');
    assert.ok(lib.agencyCode, 'Must have agencyCode');
    assert.ok(lib.sourceName, 'Must have sourceName');
    assert.strictEqual(lib.type, 'university', 'Must have type university');
    assert.strictEqual(lib.defaultScheme, 'LCC', 'Must default to LCC classification');
    assert.ok(lib.opacUrl.startsWith('http'), 'Must have valid opacUrl');
    assert.ok(lib.contact.includes('@'), 'Must have valid contact email');

    const retrieved = getAcademicLibrary(lib.sourceCode);
    assert.strictEqual(retrieved.agencyCode, lib.agencyCode);
  }
});

test('Academic Libraries Registered in data/sources.json and data/orgs.json', () => {
  const root = process.cwd();
  const sources = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sources.json'), 'utf8'));
  const orgs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'orgs.json'), 'utf8'));

  for (const lib of ACADEMIC_LIBRARIES) {
    assert.ok(sources[lib.sourceCode], `sources.json missing ${lib.sourceCode}`);
    assert.strictEqual(sources[lib.sourceCode].organization, lib.agencyCode);

    assert.ok(orgs[lib.agencyCode], `orgs.json missing ${lib.agencyCode}`);
    assert.strictEqual(orgs[lib.agencyCode].type, 'university');
    assert.strictEqual(orgs[lib.agencyCode].default_scheme, 'LCC');
  }

  // Schema validation on orgs.json
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'schemas', 'orgs.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);
  assert.strictEqual(validate(orgs), true, 'orgs.json must satisfy schema');
});

test('Academic Library Harvesters Universal Verification Suite', async (t) => {
  for (const lib of ACADEMIC_LIBRARIES) {
    const mod = academicModules[lib.sourceCode];
    const { sourceCode, agencyCode, sourceName } = lib;

    assert.ok(mod, `Harvester module for ${sourceCode} must be loaded`);
    assert.strictEqual(mod.SOURCE_CODE, sourceCode);
    assert.strictEqual(mod.AGENCY_CODE, agencyCode);
    assert.strictEqual(mod.DEFAULT_SCHEME, 'LCC');

    await t.test(`${agencyCode} (${sourceName}) - CLI argument parsing`, () => {
      const opts = mod.parseArgs(['--start-bib', '100', '--end-bib', '250', '--delay', '1500', '--max-records', '15']);
      assert.strictEqual(opts.startBib, 100);
      assert.strictEqual(opts.endBib, 250);
      assert.strictEqual(opts.delayMs, 1500);
      assert.strictEqual(opts.maxRecords, 15);
    });

    await t.test(`${agencyCode} - Validates mandatory MARC tags (001 and 245)`, () => {
      const valid = '<record><controlfield tag="001">123</controlfield><datafield tag="245"><subfield code="a">Thesis Title</subfield></datafield></record>';
      const no001 = '<record><datafield tag="245"><subfield code="a">Thesis Title</subfield></datafield></record>';
      const no245 = '<record><controlfield tag="001">123</controlfield></record>';

      assert.strictEqual(mod.validateRecordContent(valid), true);
      assert.strictEqual(mod.validateRecordContent(no001), false);
      assert.strictEqual(mod.validateRecordContent(no245), false);
    });

    await t.test(`${agencyCode} - Generates valid MARCXML record with LCC classification`, () => {
      const sample = {
        id: '987654',
        title: 'Artificial Intelligence Principles in Higher Education',
        author: 'Prof. Dr. Hashim',
        isbn: '9789671234567',
        lcc: 'QA76.73 .H37 2024',
        publisher: `${agencyCode} Press`,
        year: '2024',
        subjects: ['Artificial Intelligence', 'Education, Higher']
      };

      const xml = mod.recordToMarcXml(sample);
      assert.ok(xml, 'XML should be produced');
      assert.strictEqual(mod.validateRecordContent(xml), true);
      assert.ok(xml.includes('<controlfield tag="001">987654</controlfield>'), 'Contains controlfield 001');
      assert.ok(xml.includes(`tag="003">${agencyCode}</controlfield>`), `Contains agency 003 ${agencyCode}`);
      assert.ok(xml.includes('<subfield code="a">Artificial Intelligence Principles in Higher Education</subfield>'), 'Contains 245 title');
      assert.ok(xml.includes('tag="050"'), 'Contains LCC classification tag 050');
      assert.ok(xml.includes('QA76.73 .H37 2024'), 'Contains exact LCC call number');
      assert.ok(xml.includes(`tag="996" ind1=" " ind2=" "><subfield code="a">${sourceCode}</subfield>`), `Contains source tag 996 ${sourceCode}`);
      assert.ok(xml.includes('tag="952"') || xml.includes('tag="852"'), 'Contains holdings tag');
    });

    await t.test(`${agencyCode} - Self-heals corrupted XML batches and repairs provenance`, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `test-acad-${sourceCode}-`));
      const recordsDir = path.join(tmpDir, 'records');
      fs.mkdirSync(recordsDir, { recursive: true });

      // Valid batch
      fs.writeFileSync(path.join(recordsDir, 'batch_0.xml'), '<collection xmlns="http://www.loc.gov/MARC21/slim"><record><controlfield tag="001">1</controlfield><datafield tag="245"><subfield code="a">Valid</subfield></datafield></record></collection>', 'utf8');
      // Corrupt batch
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

    await t.test(`${agencyCode} - Handles --help gracefully`, async () => {
      const codeResult = await mod.runHarvest({ help: true });
      assert.strictEqual(codeResult, 0);
    });
  }
});
