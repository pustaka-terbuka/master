import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ACADEMIC_LIBRARIES } from './lib/academic-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const opacRoot = path.resolve(__dirname, '..');

const sourcesPath = path.join(opacRoot, 'data', 'sources.json');
const orgsPath = path.join(opacRoot, 'data', 'orgs.json');
const orgsSchemaPath = path.join(opacRoot, 'tools', 'schemas', 'orgs.schema.json');

const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const orgs = JSON.parse(fs.readFileSync(orgsPath, 'utf8'));

for (const lib of ACADEMIC_LIBRARIES) {
  // 1. Register in sources.json
  sources[lib.sourceCode] = {
    name: lib.sourceName,
    prefix: lib.agencyCode,
    priority: lib.priority,
    organization: lib.agencyCode,
    repository: `https://github.com/pustaka-terbuka/${lib.sourceCode}`,
    localPath: `../${lib.sourceCode}`,
    dataPath: `../${lib.sourceCode}/data`,
    opacUrl: lib.opacUrl
  };

  // 2. Register in orgs.json
  orgs[lib.agencyCode] = {
    name: lib.sourceName,
    state: lib.state,
    type: lib.type,
    default_scheme: lib.defaultScheme,
    contact: lib.contact,
    opac_url: lib.opacUrl
  };
}

// Validate orgs.json with Ajv against schema
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const schema = JSON.parse(fs.readFileSync(orgsSchemaPath, 'utf8'));
const validate = ajv.compile(schema);
const valid = validate(orgs);

if (!valid) {
  console.error('Validation errors for orgs.json:', validate.errors);
  process.exit(1);
}

fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n', 'utf8');
fs.writeFileSync(orgsPath, JSON.stringify(orgs, null, 2) + '\n', 'utf8');

console.log(`Registered ${ACADEMIC_LIBRARIES.length} academic libraries into sources.json and orgs.json.`);
console.log('orgs.json Schema validation passed successfully!');
