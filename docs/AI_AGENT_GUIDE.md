# AI Agent Master Architecture & Engineering Guide

> **Normative System Guide for Autonomous & Assisted AI Agents Working on PustakaTerbuka.**

Welcome, AI Agent. This document is your comprehensive operational blueprint for the **PustakaTerbuka** repository. It defines the core architectural invariants, directory boundaries, pipeline lifecycles, data contracts, and operating rules you must uphold.

---

## 1. System Invariants & Non-Negotiables

Whenever you inspect, refactor, or generate code in this repository, you must maintain these invariants:

1. **Serverless & Zero-Dynamic-Backend:**
   - PustakaTerbuka is a static GitOps union catalog. The production frontend and client endpoints are hosted statically on **GitHub Pages**.
   - Bulk downloads are hosted on **GitHub Releases**.
   - Never introduce dynamic web servers (Express, Flask, ASP.NET backend) or persistent remote databases (PostgreSQL, MySQL, MongoDB). Searching is executed entirely client-side via **Pagefind** WASM chunks.
2. **Deterministic Record Identity:**
   - Permanent record IDs are **10-character Crockford Base32** strings (e.g., `07wbdk04t6`).
   - IDs are immutable. Sharding is strictly based on the first two characters (e.g., `data/bib/07/07wbdk04t6.xml`).
   - When duplicate records merge, one ID is retained as canonical; retired IDs and ISBNs are recorded in `data/aliases.jsonl.gz`.
3. **Strict Tag Preservation:**
   - Original source data (PNM control number `001`, `035`, `040`, `082`, `852`) must be preserved with 100% fidelity.
   - PustakaTerbuka only injects attribution fields (`040 $d`, `856`, `900`) during the build phase for client endpoints.
4. **Safety & Side Effects:**
   - Never contact live external library OPACs during test execution. Harvesters are decoupled and executed separately.
   - `Publish-Catalog.ps1` defaults to dry-run mode (`-WhatIf`). Never execute `-Force` pushes or git releases without explicit operator confirmation.
5. **Cross-Platform & Windows NTFS Compatibility:**
   - The primary operator environment is Windows 10/11 with PowerShell and Node.js LTS.
   - Always write files as **UTF-8 without BOM**.
   - Use cross-platform path handling (`path.join`) and avoid Linux-only shell assumptions. Keep generated paths concise to respect Windows path limits.
6. **Harvester Standards & Architecture:**
   - All library scrapers and harvesters must strictly follow [docs/HARVESTERS.md](HARVESTERS.md), [docs/HARVESTER_DEVELOPER_GUIDE.md](HARVESTER_DEVELOPER_GUIDE.md), and [docs/ORGANIZATION_WORKFLOW.md](ORGANIZATION_WORKFLOW.md).

---

## 2. Repository Layout Map

```
pustaka-terbuka/
├── data/                                 # Authoritative source-of-truth data (Committed to Git)
│   ├── bib/<shard-2-char>/<id>.xml       # Canonical sharded MARCXML records (e.g., bib/07/07wbdk04t6.xml)
│   ├── holdings/<ORG>.csv                # Participating library holdings (barcodes, call numbers)
│   ├── aliases.jsonl.gz                  # ISBN / ISSN / retired-ID to canonical record ID mapping
│   ├── manifest.json                     # SHA-256 hash manifest for incremental builds
│   ├── orgs.json                         # Registered schools and libraries registry
│   ├── sources.json                      # Ingestion source providers (PNM, LC, etc.)
│   └── state/                            # Ingestion watermark & state files
├── harvest/                              # Raw harvester intake
│   ├── config.json                       # Harvester configurations
│   └── inbox/<source>/<run-id>/          # Harvester drop folders (manifest.json, records/, provenance.jsonl)
├── tools/                                # Core Node.js pipeline CLI tools
│   ├── validate-inbox.js                 # Gate 1: Harvester inbox schema and XML validator
│   ├── merge.js                          # Gate 2: Deduplication, ID assignment, and alias resolver
│   ├── validate-holdings.js              # Gate 3: Holding CSV integrity validator
│   ├── build.js                          # Gate 4: Static site, Pagefind index, and endpoints builder
│   ├── pilot-report.js                   # Scale verification & report tool
│   └── lib/                              # Low-level modules (marcxml, aliases, callnumber, isbn, etc.)
├── dumps/                                # Output directory for bulk release exports (Ignored by Git)
│   ├── pustakaterbuka-all-*.mrc          # ISO-2709 binary MARC dump
│   └── pustakaterbuka-all-*.xml          # Full MARCXML collection dump
├── dist/                                 # Built static distribution deployed to gh-pages branch
│   ├── id/<id>.xml                       # Direct fetch by Crockford Base32 ID (with attribution)
│   ├── isbn/<isbn>.xml                   # Direct fetch by normalized ISBN (with attribution)
│   ├── issn/<issn>.xml                   # Direct fetch by normalized ISSN (with attribution)
│   ├── export/<id>.xml                   # Clean MARCXML export (internal 99x tags stripped)
│   ├── pagefind/                         # Pagefind search index WASM chunks
│   ├── org/<org>/index.json              # Per-organization holding index
│   ├── browse/<org>/<scheme>.json        # Precomputed DDC/LCC shelf browse
│   ├── book/index.html & aliases.json    # Universal client-side dynamic record resolver
│   └── data/shard/<shard>.json           # Lightweight sharded metadata JSON
├── site/                                 # Static OPAC UI templates, styles, and client scripts
├── scripts/                              # Orchestration scripts
│   ├── Publish-Catalog.ps1               # Master end-to-end publishing script (PowerShell)
│   └── Commit-Chunks.ps1                 # Batch chunk committer
├── tests/                                # Automated test suite (Node built-in test runner)
└── docs/                                 # Authoritative documentation suite
```

---

## 3. The 6-Stage Pipeline Lifecycle

When `Publish-Catalog.ps1` runs (or when you trigger individual tools), records transition through these gates:

```
[ Harvesters / LMS Client Ingestion ]
                  │
                  ▼
         harvest/inbox/<source>/<run-id>/
                  │
                  ▼
      1. npm run validate-inbox
         - Validates manifest.json, provenance.jsonl, and records/*.xml
         - Checks UTF-8, well-formed MARCXML, required 245 field
         - Enforces drop-gate threshold (record count cannot drop > 5%)
                  │
                  ▼
      2. npm run merge
         - Identifies existing records via ISBN, LCCN, and fallback match keys
         - Resolves master record based on quality score (encoding level, 040 DLC, richness)
         - Assigns 10-char Crockford Base32 ID
         - Rewrites data/bib/<shard>/<id>.xml and updates data/aliases.jsonl.gz
                  │
                  ▼
      3. npm run validate-holdings
         - Checks data/holdings/*.csv against data/orgs.json
         - Resolves holding identifiers against aliases table
                  │
                  ▼
      4. npm run build
         - Generates static OPAC into dist/
         - Indexes records into Pagefind WASM index
         - Generates /id/, /isbn/, /issn/, and /export/ XML endpoints with attribution
         - Streams bulk ISO-2709 (.mrc) and MARCXML (.xml) dumps into dumps/
         - Enforces size budgets (Warn: 700MB, Fail: 950MB) and file counts (Warn: 80k, Fail: 100k)
                  │
                  ▼
      5. npm test
         - Executes complete test suite (tests/*.test.js)
                  │
                  ▼
      6. Publish Phase (Publish-Catalog.ps1)
         - Git commit source data/ to main branch
         - Create timestamped release tag (catalog-YYYYMMDD-HHmm)
         - Force-push dist/ to gh-pages branch
         - Upload dumps/* to GitHub Release via gh release create
```

---

## 4. Key Data Contracts & Schemas

### 4.1 MARC Attribution Contract
When generating client endpoints (`/isbn/`, `/issn/`, `/id/`, `/export/`), `tools/lib/build.js` injects:
- **MARC `040 $d`:** Value `"PustakaTerbuka"`.
- **MARC `856` (ind1="4", ind2="2"):**
  - `$u`: `"https://github.com/aplikasi-perpustakaan/pustaka-terbuka"`
  - `$y`: `"PustakaTerbuka"`
  - `$z`: `"Shared open catalog record provided by PustakaTerbuka"`
- **MARC `900` (ind1=" ", ind2=" "):**
  - `$a`: `"PustakaTerbuka"`
  - `$u`: `"https://github.com/aplikasi-perpustakaan/pustaka-terbuka"`
  - `$d`: `"Open Shared MARC Catalog for Malaysian Libraries"`
  - `$r`: `{recordId}`

### 4.2 Holdings CSV Schema (`data/holdings/<ORG>.csv`)
```csv
record,org,scheme,class_number,item_number,full_call_number,location
9789830123456,SKBayanLepas,DDC,510,MAT,510 MAT,Main
```
- `record`: Normalized ISBN-13, ISBN-10, or canonical 10-char Base32 ID.
- `org`: Organization code matching `data/orgs.json`.
- `scheme`: `"DDC"` or `"LCC"`.
- `full_call_number`: Full printable call number string.

### 4.3 Aliases File (`data/aliases.jsonl.gz`)
Format: Compressed JSON Lines, sorted alphabetically by `key`.
```json
{"key":"9789830123456","id":"07wbdk04t6","type":"isbn","ts":"2026-10-10T00:00:00Z"}
{"key":"OLDREC1234","id":"07wbdk04t6","type":"retired","ts":"2026-10-10T00:00:00Z"}
```

---

## 5. Client Integration Standards (LMS / ILS)

1. **Option B (Client-Side Caching):**
   - PustakaTerbuka does **not** commit or host binary databases (SQLite, etc.).
   - Client applications (such as .NET 4.7 WinForms on Windows 7+) download bulk `.xml` or `.mrc` release dumps and ingest them into their own local SQLite databases using streaming `XmlReader`.
2. **Direct Point Lookups:**
   - Supported via `/isbn/{isbn}.xml` and `/issn/{issn}.xml`. Client must strip hyphens.
3. **Required Client UI Prompt:**
   - When a record is not found during copy cataloging, client UI must display:
     `"Book not found in Pustaka Terbuka catalog. Enter details to create a new record."`
4. **Offline Contribution Packages:**
   - School librarians export contributions as `.zip` containing `manifest.json`, `provenance.jsonl`, `records/batch_0.xml`, and `holdings.csv`.
   - Maintainers place these into `harvest/inbox/<school-code>/<run-id>/`.

---

## 6. How to Run Tests & Verify Changes

Before finalizing any changes, always run:
```bash
# 1. Run all unit tests
npm test

# 2. Run targeted test
node --test tests/client-endpoints.test.js
node --test tests/m5-build.test.js

# 3. Dry-run publish pipeline
pwsh -ExecutionPolicy Bypass -File scripts/Publish-Catalog.ps1 -WhatIf -SkipHarvest
```
Ensure all tests pass and that output size and file count budgets remain healthy.

---

## 7. Multi-Organization Harvester Concurrency & Conflict Prevention

PustakaTerbuka operates as a multi-repository, multi-tenant union catalog. Each data provider institution (e.g., `pnm`, `ppapp`, and future library providers) maintains an independent repository and crawler engine.

### 7.1 Why Concurrent Harvesters Do Not Conflict
Running multiple harvesters for different institutions concurrently on the same machine or CI runner is fully supported and will not cause data corruption or collisions due to three architectural barriers:

1. **Filesystem & Repository Isolation:**
   - Each institution scraper runs strictly within its own directory tree (`pnm/`, `ppapp/`).
   - Raw harvested outputs are namespaced under separate inboxes (`harvest/inbox/<provider>/<run-id>/`).
   - Git commits, history, and branches are completely isolated across repositories.
2. **Independent Target Domains:**
   - Each harvester communicates exclusively with its institution's OPAC endpoint (e.g., `opac.pnm.gov.my` vs. `opac.penanglib.gov.my`).
   - Network requests, HTTP sessions, rate limits, and IP quotas operate on separate domains, preventing rate-limiting crosstalk or shared 429 throttling.
3. **Deterministic Union Merge in `master`:**
   - `master` serves as the consumer union catalog. When records from multiple providers match the same physical book (identical ISBN-13, ISBN-10, or control key), `tools/lib/merge.js` resolves the canonical record deterministically using the priority scores in `data/sources.json`:
     - **Bibliographic Metadata:** Higher priority source wins the canonical record fields (e.g., PNM priority 10 vs. PPAPP priority 8).
     - **Holdings Preservation:** Local institutional holdings (MARC `852` / `952` and `data/holdings/`) are preserved for both institutions.
     - **Global Alias Resolution:** Source-specific identifiers (`001`, local biblionumbers, and ISBNs) are all mapped to the shared Crockford Base32 ID in `data/aliases.jsonl.gz`.

### 7.2 The 3 Golden Operational Rules for AI Agents and Operators

1. **Rule 1: Maximum One Active Harvester Worker per Target Institution.**
   - While you can safely run the PNM harvester and the PPAPP harvester in parallel, **never run multiple concurrent crawlers against the same library**. Spawning parallel workers against the same OPAC host risks IP bans, HTTP 429 throttling, or out-of-order cursor state collisions in `partition_state.json`.
2. **Rule 2: Sequential Master Ingestion & Build.**
   - Harvester runs in provider repos happen concurrently, but merging and building inside `master` (`node tools/merge.js`, `node tools/build.js`) must be executed **sequentially** to prevent write locks on `dist/` shards and the Pagefind index.
3. **Rule 3: Machine Resource Budgeting.**
   - Harvester workers enforce a mandatory politeness delay (2,000 ms between requests), which means each Node.js process spends >90% of its lifecycle sleeping and consumes only ~50–80 MB RAM. A standard developer machine can comfortably run 3 to 6 distinct provider harvesters simultaneously without resource exhaustion.

