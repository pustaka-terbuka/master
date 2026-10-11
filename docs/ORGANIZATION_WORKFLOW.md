# End-to-End Organization & Harvester Onboarding Workflow

> **Authoritative Operational Guide for Registering, Harvester Construction, Ingesting, and Displaying New Libraries in the Pustaka Terbuka Union Catalog.**

---

## 1. Architectural Overview & Context

Pustaka Terbuka is a **100% serverless, static GitOps union catalog** (*Katalog Induk Kebangsaan*) for Malaysian public, state, academic, and school libraries.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Source Repositories                             │
│  pustaka-terbuka/pnm         pustaka-terbuka/ppapp      pustaka-terbuka/ppas │
│  (Innovative Vega API)       (Koha ILS OPAC)            (Spydus / Koha)│
└──────────────┬─────────────────────────┬───────────────────────┬───────┘
               │                         │                       │
               ▼                         ▼                       ▼
    harvest/inbox/pnm/         harvest/inbox/ppapp/     harvest/inbox/ppas/
               │                         │                       │
               └─────────────────────────┼───────────────────────┘
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Gate 1: tools/validate-inbox.js       │
                     └───────────────────┬───────────────────┘
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Gate 2: tools/merge.js                │
                     │ (Deduplication & Base32 Crockford)    │
                     └───────────────────┬───────────────────┘
                                         ▼
                               data/bib/<shard>/<id>.xml
                                         │
                     ┌───────────────────┴───────────────────┐
                     │ Gate 3: tools/build.js                │
                     │ - Holdings Extraction (852 & 952)     │
                     │ - Pagefind WASM Filter Indexing       │
                     │ - dist/org/<ORG>/index.json           │
                     │ - dist/browse/<ORG>/DDC.json          │
                     └───────────────────┬───────────────────┘
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Master OPAC Search Page               │
                     │ - Dynamic #org-filter Dropdown        │
                     │ - Filter-Only & Keyword Search        │
                     │ - Real-Time Shelf Browse & OPAC Links │
                     └───────────────────────────────────────┘
```

Because there is no dynamic server or database:
1. All catalog data is stored in sharded MARCXML files (`data/bib/<shard>/<id>.xml`).
2. Search indexing and facet filtering are performed client-side using **Pagefind WASM**.
3. Organization selection (`#org-filter`) relies on **`data/orgs.json`** combined with Pagefind's indexed facet `organization`.

If any link in this chain is missing, an organization will either fail to appear in the dropdown or return empty search results. This guide ensures every step is executed properly.

---

## 2. The 7-Step Onboarding Workflow

### Step 1: Register Source in `master/data/sources.json`

Every library source provider must be declared in `data/sources.json`. This registry tells the ingestion and merge engines the source's authority rank and filesystem coordinates.

Edit `master/data/sources.json`:
```json
{
  "ppapp": {
    "name": "Perbadanan Perpustakaan Awam Pulau Pinang",
    "prefix": "PPAPP",
    "priority": 8,
    "organization": "PPAPP",
    "repository": "https://github.com/pustaka-terbuka/ppapp",
    "localPath": "../ppapp",
    "dataPath": "../ppapp/data",
    "opacUrl": "https://opac.penanglib.gov.my/"
  }
}
```

* **`priority`**: Numerical rank for deduplication (1–10). If two libraries have the exact same book (matching ISBN or normalized title), bibliographic fields (`245`, `100`, `264`) from the higher-priority source are kept as primary, while holdings from both sources are preserved.
* **`prefix`**: Used for provenance tagging and fallback record IDs.
* **`organization`**: The institutional identifier code matching `data/orgs.json`.

---

### Step 2: Register Organization in `master/data/orgs.json`

The union catalog maintains a central registry of participating library entities in `data/orgs.json`. This provides human-readable library names, physical states, default classification schemes, and OPAC links.

Edit `master/data/orgs.json`:
```json
{
  "PPAPP": {
    "name": "Perbadanan Perpustakaan Awam Pulau Pinang",
    "state": "Pulau Pinang",
    "type": "public",
    "default_scheme": "DDC",
    "contact": "info@penanglib.gov.my",
    "opac_url": "https://opac.penanglib.gov.my/"
  }
}
```

* Supported `type` values: `"public"`, `"university"`, `"school"`, `"special"`.
* Supported `default_scheme` values: `"DDC"` (Dewey Decimal Classification) or `"LCC"` (Library of Congress Classification).
* Verify registry schema validity at any time:
  ```bash
  node tools/validate-holdings.js --data-dir data
  ```

---

### Step 3: Implement Source Harvester

Create the harvester adapter in `ppapp/tools/harvesters/<source>/harvester.js` (and mirror to `master/tools/harvesters/<source>/harvester.js` for local orchestration).

#### 3.1 Source Invariants
1. **Raw As Received**: Capture original metadata faithfully without premature deduplication.
2. **Preserve MARC Control Identifiers**:
   - `001`: Original ILS bibliographic number (e.g. Koha `biblionumber`, VTLS local ID).
   - `003`: Agency identifier (e.g. `PPAPP`, `MY-KLP`).
   - `040 $a`: Original cataloging agency code.
   - `082` / `090`: Dewey Decimal Classification call numbers.
3. **Capture Item Holdings**:
   - **Koha Systems**: Embed physical copies in MARC `952` tags:
     - `952 $o`: Local call number (e.g. `C 615.5 STE`, `332.1088297 ASY`).
     - `952 $a` / `$b`: Holding branch or library code (e.g. `PUS` for Perpustakaan Pusat, `GT` for George Town).
     - `952 $p`: Barcode identifier.
   - **Vega / Sierra Systems**: Embed call numbers in MARC `852 $h` with location in `852 $b`.
   - **School / Branch Libraries**: If the library provides a separate CSV, place it in `data/holdings/<ORG>.csv`.

#### 3.2 Output Inbox Contract
The harvester must write output to:
```text
harvest/inbox/<source-code>/<run-id>/
├── manifest.json
├── partition_state.json
├── provenance.jsonl
└── records/
    ├── batch_0.xml
    └── ...
```

---

### Step 4: Validate Inbox Data (Gate 1)

Before merging any harvested batch into the master catalog, run the inbox gate validator:

```bash
node tools/validate-inbox.js harvest/inbox/ppapp/<run-id>/
```

The validator verifies:
- `manifest.json` schema compliance (`source_code`, `status`, `record_count`).
- UTF-8 XML well-formedness and schema conformity.
- Every record has a valid control number (`001` or `035`) and title (`245 $a`).
- Record count matches `manifest.json`.

---

### Step 5: Merge into Canonical Master Shards (Gate 2)

Merge the validated batch into canonical master Crockford Base32 shards:

```bash
node tools/merge.js harvest/inbox/ppapp/<run-id>/ --data-dir data
```

What the merge engine does:
1. **Deduplication**: Resolves ISBN and title fallback keys against `data/aliases.jsonl`.
2. **ID Assignment**: Assigns a deterministic 10-character Crockford Base32 record ID (e.g., `05dzmkzxep`).
3. **Sharding**: Writes canonical MARCXML to `data/bib/<shard>/<id>.xml` (e.g. `data/bib/05/05dzmkzxep.xml`).
4. **Holdings Fusion**: Merges physical copy holdings from all contributing libraries without overwriting existing holding tags.

---

### Step 6: Build Static Union Catalog & Pagefind Index (Gates 3 & 4)

Run the static build pipeline in `master`:

```bash
node tools/build.js --data-dir data
```

The build engine executes these critical steps:
1. **Multi-Organization Holdings Extraction** (`tools/lib/build.js`):
   - Resolves `sourceOrg` from MARC `003`, `040 $a`, or source manifest.
   - Parses physical copies from Koha `952` tags or MARC `852` tags into `formattedHoldings`.
   - Computes dynamic OPAC links:
     - PNM: `https://opac.pnm.gov.my/search?query=...`
     - PPAPP: `https://opac.penanglib.gov.my/cgi-bin/koha/opac-detail.pl?biblionumber=${control001}`
2. **Pagefind Filter Indexing**:
   - Indexes records with `filters: { organization: orgCodes }` where `orgCodes = ['PPAPP', ...]`.
3. **Generates Client Org Endpoints**:
   - `dist/org/<ORG>/index.json`: Flat index of all books held by the organization.
   - `dist/browse/<ORG>/DDC.json` and `LCC.json`: Sorted virtual shelf browse catalogs.
4. **Copies Static Site Files**:
   - Copies `data/orgs.json` -> `dist/orgs.json`.
   - Copies `site/app.js`, `site/index.html`, `site/style.css` -> `dist/`.

---

### Step 7: Verify Frontend Dropdown & Filter Browsing

Open `dist/index.html` (or test on GitHub Pages):

1. **Dropdown Population**:
   - `#org-filter` combines keys from `dist/orgs.json` and Pagefind's `filters().organization`.
   - The organization appears formatted as: `Perbadanan Perpustakaan Awam Pulau Pinang (PPAPP)`.
2. **Direct Selection**:
   - Selecting `PPAPP` triggers `onOrgChange('PPAPP')`.
   - The UI displays:
     - Total matching records: `15 results found. (Perbadanan Perpustakaan Awam Pulau Pinang)`
     - Shelf browse link: `Browse DDC` linking to `browse/PPAPP/DDC.json`.
     - Direct OPAC links on each book card linking to Koha's `opac-detail.pl?biblionumber=...`.
3. **URL Deep Linking**:
   - Navigating to `index.html?org=PPAPP` automatically sets the dropdown, filters the search results, and loads the organization shelf links.

---

## 3. Summary Checklist for New Libraries

| Step | Action | Command / File | Verification |
|:---|:---|:---|:---|
| 1 | Register Source | `master/data/sources.json` | JSON valid, unique prefix |
| 2 | Register Organization | `master/data/orgs.json` | `npm run validate-holdings` |
| 3 | Build Harvester | `tools/harvesters/<source>/` | Implements 2s delay, outputs inbox format |
| 4 | Run Harvest Batch | `node harvester.js --max-pages 1` | Output created in `harvest/inbox/` |
| 5 | Validate Inbox | `node tools/validate-inbox.js <path>` | Exit code `0` |
| 6 | Merge to Master | `node tools/merge.js <path>` | Records added to `data/bib/` |
| 7 | Build Master Site | `node tools/build.js --data-dir data` | `dist/org/<ORG>/index.json` created |
| 8 | Verify Dropdown | `dist/index.html?org=<ORG>` | Organization visible in dropdown |

---

## 4. Troubleshooting Common Issues

### Issue A: Organization is Missing from `#org-filter`
- **Cause 1**: The organization was not added to `data/orgs.json`.
  * **Fix**: Add the organization metadata to `data/orgs.json`.
- **Cause 2**: The site has not been rebuilt since merging new records.
  * **Fix**: Re-run `node tools/build.js --data-dir data`.
- **Cause 3**: Harvester did not preserve `003`, `040 $a`, or `952` item tags, causing `build.js` to find 0 holdings.
  * **Fix**: Ensure Koha items have `$o` and `$a`/`$b` in tag `952` and re-merge.

### Issue B: Selecting Organization Shows "No results found"
- **Cause**: Search input was empty and Pagefind query was not handling filter-only queries.
  * **Fix**: Ensure `site/app.js` passes `pagefind.search(null, { filters: { organization: [currentOrg] } })` when search input is empty.

### Issue C: OPAC Link Points to `#`
- **Cause**: `build.js` did not recognize the organization code for custom link construction, or `orgs.json` was missing `opac_url`.
  * **Fix**: Add `opac_url` in `data/orgs.json` and ensure `build.js` formats the URL with the record's control number or ISBN.
