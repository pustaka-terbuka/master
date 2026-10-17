#!/usr/bin/env node

/**
 * PustakaTerbuka - UMPSA (Perpustakaan Universiti Malaysia Pahang Al-Sultan Abdullah) Harvester
 * 
 * Harvests catalog records from Universiti Malaysia Pahang Al-Sultan Abdullah (koha ILS)
 * into MARCXML following PustakaTerbuka Harvester Standards and Decision D005 Chunk Lifecycle.
 * 
 * Normative Spec: master/docs/HARVESTER_DEVELOPER_GUIDE.md & docs/HARVESTERS.md
 * Output: harvest/inbox/umpsa/<run-id>-chunk-<xxx>/
 *   - manifest.json
 *   - provenance.jsonl
 *   - records/batch_<n>.xml
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { getAcademicLibrary } from '../../lib/academic-registry.js';
import { createAcademicHarvester } from '../../lib/academic-harvester-factory.js';

const config = getAcademicLibrary('umpsa');
const instance = createAcademicHarvester(config);

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
      console.error(`[${config.agencyCode} FATAL] ${err.stack || err.message}`);
      process.exit(1);
    });
}
