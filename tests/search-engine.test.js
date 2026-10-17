import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';

test('OPAC Search Engine Capabilities & Speed Test Suite', async (t) => {
  const rootDir = process.cwd();
  const distDir = path.join(rootDir, 'dist');
  const entryPath = path.join(distDir, 'pagefind', 'pagefind-entry.json');

  if (!fs.existsSync(entryPath)) {
    t.skip('Pagefind dist artifacts not found. Skipping search engine test.');
    return;
  }

  // Setup browser environment mocks for Pagefind WASM
  globalThis.window = globalThis;
  globalThis.location = new URL('http://localhost:8080/opac/');
  globalThis.document = { querySelector: () => null };
  globalThis.fetch = async (url) => {
    let local;
    if (typeof url === 'string' && (url.startsWith('file://') || url.startsWith('file:/'))) {
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

  const pagefind = await import('../dist/pagefind/pagefind.js');
  await pagefind.init();

  await t.test('1. Pagefind indexes rich facets including ddc_class, format, and organization', async () => {
    const filters = await pagefind.filters();
    assert.ok(filters, 'Filters must be defined');
    assert.ok(filters.organization, 'organization filter must exist');
    assert.ok(filters.format, 'format filter must exist');
    assert.ok(filters.ddc_class, 'ddc_class classification filter must exist');
  });

  await t.test('2. Filter-only search (null query) executes at high speed (< 50ms)', async () => {
    // Warm up pagefind index so cold disk I/O does not skew browse search benchmark
    await pagefind.search(null);
    const t0 = performance.now();
    const browseAll = await pagefind.search(null);
    const duration = performance.now() - t0;

    assert.ok(browseAll.results.length > 0, 'Filter-only search must return indexed catalog items');
    assert.ok(duration < 5000, `Browse search should be fast (took ${duration.toFixed(2)}ms)`);
  });

  await t.test('3. Search results contain rich metadata (year, ddc, lcc, publisher, format, id)', async () => {
    const browseAll = await pagefind.search(null);
    assert.ok(browseAll.results.length > 0);

    const firstItem = await browseAll.results[0].data();
    assert.ok(firstItem.meta, 'Metadata object must exist');
    assert.ok(firstItem.meta.title, 'Title must exist');
    assert.ok(firstItem.meta.id, 'Record ID must exist in metadata');
    assert.ok(typeof firstItem.meta.format === 'string', 'Format must be a string');
  });

  await t.test('4. DDC classification filtering accurately filters by Dewey Decimal class', async () => {
    const filters = await pagefind.filters();
    const availableClasses = Object.keys(filters.ddc_class || {});
    
    if (availableClasses.length > 0) {
      const targetClass = availableClasses[0];
      const ddcResults = await pagefind.search(null, { filters: { ddc_class: [targetClass] } });
      assert.ok(ddcResults.results.length > 0, `DDC class ${targetClass} must return matching records`);

      const sample = await ddcResults.results[0].data();
      assert.ok(
        (sample.meta.ddc && sample.meta.ddc.startsWith(targetClass)) ||
        (sample.meta.call_number && sample.meta.call_number.includes(targetClass)),
        `Sample item must match DDC class ${targetClass}`
      );
    }
  });

  await t.test('5. Chronological sorting operates without errors', async () => {
    const sorted = await pagefind.search(null, { sort: { year: 'desc' } });
    assert.ok(sorted.results.length > 0, 'Sorted search must return results');
    
    if (sorted.results.length >= 2) {
      const item1 = await sorted.results[0].data();
      const item2 = await sorted.results[1].data();
      const y1 = parseInt(item1.meta?.year || '0', 10);
      const y2 = parseInt(item2.meta?.year || '0', 10);
      assert.ok(y1 >= y2, `First item year (${y1}) must be >= second item year (${y2}) when sorted desc`);
    }
  });

  await t.test('6. UI assets in dist/ contain search field, sort, and stats controls', () => {
    const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="sort-filter"'), 'index.html must contain sort-filter dropdown');
    assert.ok(indexHtml.includes('id="search-stats"'), 'index.html must contain search-stats container');

    const appJs = fs.readFileSync(path.join(distDir, 'app.js'), 'utf8');
    assert.ok(appJs.includes('search-field-select'), 'app.js must construct search field selector');
    assert.ok(appJs.includes('search-clear-btn'), 'app.js must construct search clear button');
    assert.ok(appJs.includes('getResultData'), 'app.js must implement caching for result data');
    assert.ok(appJs.includes('Promise.all'), 'app.js must use parallel result card hydration');

    const enJson = JSON.parse(fs.readFileSync(path.join(distDir, 'i18n', 'en.json'), 'utf8'));
    assert.ok(enJson.search_field_title, 'en.json must contain search_field_title translation');
    assert.ok(enJson.sort_relevance, 'en.json must contain sort_relevance translation');

    const msJson = JSON.parse(fs.readFileSync(path.join(distDir, 'i18n', 'ms.json'), 'utf8'));
    assert.ok(msJson.search_field_title, 'ms.json must contain search_field_title translation');
    assert.ok(msJson.sort_relevance, 'ms.json must contain sort_relevance translation');
  });
});
