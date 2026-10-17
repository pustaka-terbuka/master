import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { EXTENDED_LIBRARIES, getExtendedLibrary } from '../tools/lib/extended-registry.js';
import { escapeXml } from '../tools/lib/harvester-base.js';

test('Extended Libraries Registry Integrity', () => {
  assert.strictEqual(EXTENDED_LIBRARIES.length, 30, 'Registry must contain 30 extended libraries');
  
  for (const lib of EXTENDED_LIBRARIES) {
    assert.ok(lib.sourceCode, 'Must have sourceCode');
    assert.ok(lib.agencyCode, 'Must have agencyCode');
    assert.ok(lib.sourceName, 'Must have sourceName');
    assert.ok(['school', 'university', 'public', 'special'].includes(lib.type), 'Must have valid type');
    assert.ok(['LCC', 'DDC'].includes(lib.defaultScheme), 'Must default to LCC or DDC');
    assert.ok(lib.opacUrl.startsWith('http'), 'Must have valid opacUrl');
    assert.ok(lib.contact.includes('@'), 'Must have valid contact email');

    const retrieved = getExtendedLibrary(lib.sourceCode);
    assert.strictEqual(retrieved.agencyCode, lib.agencyCode);
  }
});

test('Extended Libraries Registered in data/sources.json and data/orgs.json', () => {
  const root = process.cwd();
  const sources = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sources.json'), 'utf8'));
  const orgs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'orgs.json'), 'utf8'));

  for (const lib of EXTENDED_LIBRARIES) {
    assert.ok(sources[lib.sourceCode], `sources.json missing ${lib.sourceCode}`);
    assert.strictEqual(sources[lib.sourceCode].organization, lib.agencyCode);

    assert.ok(orgs[lib.agencyCode], `orgs.json missing ${lib.agencyCode}`);
    assert.strictEqual(orgs[lib.agencyCode].type, lib.type);
    assert.strictEqual(orgs[lib.agencyCode].default_scheme, lib.defaultScheme);
  }

  // Schema validation on orgs.json
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'schemas', 'orgs.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);
  assert.strictEqual(validate(orgs), true, 'orgs.json must satisfy schema');
});

test('Extended Library Harvesters Universal Verification Suite', async (t) => {
  for (const lib of EXTENDED_LIBRARIES) {
    const mod = await import(`../tools/harvesters/${lib.sourceCode}/harvester.js`);
    const { sourceCode, agencyCode, sourceName, defaultScheme } = lib;

    assert.ok(mod, `Harvester module for ${sourceCode} must be loaded`);
    assert.strictEqual(mod.SOURCE_CODE, sourceCode);
    assert.strictEqual(mod.AGENCY_CODE, agencyCode);
    assert.strictEqual(mod.DEFAULT_SCHEME, defaultScheme);

    await t.test(`${agencyCode} (${sourceName}) - CLI argument parsing`, () => {
      const opts = mod.parseArgs(['--start-bib', '50', '--end-bib', '100', '--delay', '1200', '--max-records', '20']);
      assert.strictEqual(opts.startBib, 50);
      assert.strictEqual(opts.endBib, 100);
      assert.strictEqual(opts.delayMs, 1200);
      assert.strictEqual(opts.maxRecords, 20);
    });

    await t.test(`${agencyCode} - Validates mandatory MARC tags (001 and 245)`, () => {
      const valid = '<record><controlfield tag="001">123</controlfield><datafield tag="245"><subfield code="a">Judul Buku</subfield></datafield></record>';
      const no001 = '<record><datafield tag="245"><subfield code="a">Judul Buku</subfield></datafield></record>';
      const no245 = '<record><controlfield tag="001">123</controlfield></record>';

      assert.strictEqual(mod.validateRecordContent(valid), true);
      assert.strictEqual(mod.validateRecordContent(no001), false);
      assert.strictEqual(mod.validateRecordContent(no245), false);
    });

    await t.test(`${agencyCode} - Generates valid MARCXML record conforming to Pustaka Terbuka gates`, () => {
      const sample = {
        id: '1001',
        title: `Koleksi Terbitan ${sourceName}`,
        author: 'Sidang Pengarang',
        isbn: '9789670001001',
        callNumber: defaultScheme === 'LCC' ? 'QA76 .M3 2024' : '020 MAL',
        publisher: `${agencyCode} Press`,
        year: '2024',
        summary: 'Ringkasan bahan rujukan',
        subjects: ['Malaysia', 'Pustaka Terbuka']
      };

      const xml = mod.recordToMarcXml(sample);
      assert.ok(xml.includes(`<controlfield tag="001">1001</controlfield>`));
      assert.ok(xml.includes(`<subfield code="a">Koleksi Terbitan ${escapeXml(sourceName)}</subfield>`));
      assert.ok(xml.includes(`<subfield code="a">${sourceCode}</subfield>`));
      assert.strictEqual(mod.validateRecordContent(xml), true);
    });
  }
});
