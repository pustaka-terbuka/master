import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTENDED_LIBRARIES } from './lib/extended-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

for (const lib of EXTENDED_LIBRARIES) {
  const dir = path.join(opacRoot, 'tools', 'harvesters', lib.sourceCode);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'harvester.js');
  
  const content = `#!/usr/bin/env node

/**
 * PustakaTerbuka - ${lib.agencyCode} (${lib.sourceName}) Harvester
 * 
 * Harvests catalog records from ${lib.shortName}
 * into MARCXML following PustakaTerbuka Harvester Standards and Decision D005 Chunk Lifecycle.
 * 
 * Normative Spec: master/docs/HARVESTER_DEVELOPER_GUIDE.md & docs/HARVESTERS.md
 * Output: harvest/inbox/${lib.sourceCode}/<run-id>-chunk-<xxx>/
 *   - manifest.json
 *   - provenance.jsonl
 *   - records/batch_<n>.xml
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { getExtendedLibrary } from '../../lib/extended-registry.js';
import { createExtendedHarvester } from '../../lib/extended-harvester-factory.js';

const config = getExtendedLibrary('${lib.sourceCode}');
const instance = createExtendedHarvester(config);

export const {
  SOURCE_CODE,
  SOURCE_NAME,
  AGENCY_CODE,
  SOURCE_BASE_URL,
  TERMS_URL,
  USER_AGENT,
  HARVESTER_NAME,
  HARVESTER_VERSION,
  DEFAULT_MAX_BIB,
  DEFAULT_BRANCH,
  DEFAULT_SCHEME,
  parseArgs,
  printHelp,
  recordToMarcXml,
  fetchRecord,
  runHarvest,
  validateRecordContent,
  inspectBatches,
  repairProvenance
} = instance;

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runHarvest(process.argv.slice(2))
    .then(code => process.exit(code || 0))
    .catch(err => {
      console.error(\`[\${config.agencyCode} FATAL] \${err.stack || err.message}\`);
      process.exit(1);
    });
}
`;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Generated harvester: tools/harvesters/${lib.sourceCode}/harvester.js`);
}

console.log(`\nSuccessfully generated ${EXTENDED_LIBRARIES.length} extended library harvesters.`);
