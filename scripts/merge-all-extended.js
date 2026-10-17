import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeInbox } from '../tools/lib/merge.js';
import { EXTENDED_LIBRARIES } from '../tools/lib/extended-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('=== Merging All Extended Harvested Inboxes into Union Catalog ===');
  const dataDir = path.join(opacRoot, 'data');
  const sourcesPath = path.join(opacRoot, 'data', 'sources.json');

  let totalNew = 0;
  let totalErrors = 0;

  for (let i = 0; i < EXTENDED_LIBRARIES.length; i++) {
    const lib = EXTENDED_LIBRARIES[i];
    const inboxDir = path.join(opacRoot, 'harvest', 'inbox', lib.sourceCode);
    if (!fs.existsSync(inboxDir)) continue;

    const runs = fs.readdirSync(inboxDir).filter(f => f.includes('chunk')).sort().reverse();
    if (runs.length === 0) continue;

    const latestRunDir = path.join(inboxDir, runs[0]);
    console.log(`[${i + 1}/${EXTENDED_LIBRARIES.length}] Merging ${lib.agencyCode} (${runs[0]})...`);

    try {
      const report = await mergeInbox(latestRunDir, { dataDir, sourcesPath });
      totalNew += report.new;
      totalErrors += report.errors;
      console.log(`  -> New: ${report.new}, Merged: ${report.mergedIntoExisting}, Errors: ${report.errors}`);
    } catch (e) {
      console.error(`  -> Failed to merge ${lib.sourceCode}:`, e.message);
      totalErrors++;
    }
  }

  console.log('\n======================================================');
  console.log(`Merge complete! Total new records merged: ${totalNew.toLocaleString()}, Total errors: ${totalErrors}`);
  console.log('======================================================');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
