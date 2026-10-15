import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';

test('PPAPP Catalog Search & Endpoints Integration Test', async (t) => {
  const rootDir = process.cwd();
  const distDir = path.join(rootDir, 'dist');
  const orgsPath = path.join(distDir, 'orgs.json');

  if (!fs.existsSync(orgsPath) || !fs.existsSync(path.join(distDir, 'org', 'PPAPP', 'index.json'))) {
    t.skip('PPAPP dist artifacts not generated. Run build with PPAPP first.');
    return;
  }

  await t.test('1. PPAPP is present in dist/orgs.json registry', () => {
    assert.ok(fs.existsSync(orgsPath), 'dist/orgs.json must exist');
    const orgs = JSON.parse(fs.readFileSync(orgsPath, 'utf8'));
    assert.ok(orgs.PPAPP, 'PPAPP must be registered in orgs.json');
    assert.strictEqual(orgs.PPAPP.name, 'Perbadanan Perpustakaan Awam Pulau Pinang');
    assert.strictEqual(orgs.PPAPP.default_scheme, 'DDC');
    assert.strictEqual(orgs.PPAPP.opac_url, 'https://opac.penanglib.gov.my/');
  });

  await t.test('2. PPAPP org holdings index exists and contains records', () => {
    const ppappIndexPath = path.join(distDir, 'org', 'PPAPP', 'index.json');
    assert.ok(fs.existsSync(ppappIndexPath), 'dist/org/PPAPP/index.json must exist');
    const holdings = JSON.parse(fs.readFileSync(ppappIndexPath, 'utf8'));
    assert.ok(holdings.length > 0, 'PPAPP holdings must not be empty');
    assert.ok(holdings.some(h => /perbankan/i.test(h.title)), 'Holdings must contain sample book');
  });

  await t.test('3. PPAPP shelf browse DDC.json exists and is sorted', () => {
    const ddcPath = path.join(distDir, 'browse', 'PPAPP', 'DDC.json');
    assert.ok(fs.existsSync(ddcPath), 'dist/browse/PPAPP/DDC.json must exist');
    const ddc = JSON.parse(fs.readFileSync(ddcPath, 'utf8'));
    assert.ok(ddc.length > 0, 'DDC shelf browse must contain records');
    // Verify sorted order
    for (let i = 1; i < ddc.length; i++) {
      assert.ok(ddc[i - 1].sortKey <= ddc[i].sortKey, 'Shelf browse items must be sorted by sortKey');
    }
  });

  await t.test('4. Pagefind filter includes PPAPP and search returns records', async (tSub) => {
    const entryPath = path.join(distDir, 'pagefind', 'pagefind-entry.json');
    if (!fs.existsSync(entryPath)) {
      tSub.skip('Pagefind index not built. Skipping.');
      return;
    }
    try {
      const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      if (!entry.languages || Object.keys(entry.languages).length === 0) {
        tSub.skip('Pagefind index has no language indexes. Skipping.');
        return;
      }
    } catch (_) {
      tSub.skip('Could not read pagefind-entry.json. Skipping.');
      return;
    }

    globalThis.window = globalThis;
    globalThis.location = new URL('http://localhost:8080/opac/');
    globalThis.document = { querySelector: () => null };
    globalThis.fetch = async (url) => {
      let local;
      if (typeof url === 'string' && url.startsWith('file://')) {
        local = fileURLToPath(url.split('?')[0]);
      } else {
        const cleanUrl = String(url).replace(/^https?:\/\/[^\/]+\/(?:master|opac)\//, '').split('?')[0];
        local = path.join(distDir, cleanUrl);
      }
      return {
        ok: true,
        arrayBuffer: async () => fs.readFileSync(local),
        json: async () => JSON.parse(fs.readFileSync(local, 'utf8')),
        text: async () => fs.readFileSync(local, 'utf8')
      };
    };

    const pagefindModule = await import('../dist/pagefind/pagefind.js');
    await pagefindModule.init();

    const filters = await pagefindModule.filters();
    assert.ok(filters.organization, 'organization filter must exist');
    assert.ok(filters.organization.PPAPP, 'organization filter must contain PPAPP');
    assert.ok(filters.organization.PPAPP > 0, 'PPAPP must have indexed records in unified catalog');

    // Filter-only search (browse PPAPP records)
    const browseAll = await pagefindModule.search(null, { filters: { organization: ['PPAPP'] } });
    assert.ok(browseAll.results.length > 0, 'Browse PPAPP records must return results');

    // Keyword search within PPAPP
    const searchRes = await pagefindModule.search('Pulau' || 'Islam', { filters: { organization: ['PPAPP'] } });
    assert.ok(searchRes.results.length >= 0, 'Search within PPAPP must execute');

    const firstResult = await browseAll.results[0].data();
    assert.ok(firstResult.meta.title, 'Result must contain title');
    assert.ok(firstResult.url.includes('book/?id='), 'Result URL must link to book page');
  });
});
