# Universal Harvester Developer & Architecture Guide

> **Authoritative Specification & Implementation Blueprint for Autonomous Agents and Engineers Building Library Harvesters in Pustaka Terbuka.**

---

## 1. Executive Summary & Purpose

Pustaka Terbuka is the open national union catalog (*Katalog Induk Kebangsaan*) for Malaysian public, academic, and school libraries. To aggregate millions of bibliographic records across diverse institutions—including Perpustakaan Negara Malaysia (PNM), state public library corporations (*Perbadanan Perpustakaan Awam Negeri* such as PPAPP, PPAS, PPAP), and academic universities (UM, UKM, USM, UTM, UiTM)—the ecosystem employs **decoupled, polite, self-healing harvesters**.

This document defines the **universal architecture, behavioral invariants, and adapter design patterns** required for all harvesters in the ecosystem. Every new harvester—regardless of programming language (Node.js or C#/.NET) or source OPAC software (Koha, Vega, Alma, SirsiDynix, Spydus)—must adhere strictly to this specification.

---

## 2. Core Invariants & System Contracts

Whenever you build, test, or run a harvester, you must maintain these four foundational invariants:

1. **Raw As Received (No Early Deduplication):**
   - Harvesters must capture bibliographic metadata exactly as exposed by the source library.
   - **Never** perform title deduplication, ISBN normalization, or cross-institutional merges inside the harvester. Deduplication is handled exclusively downstream by `tools/merge.js`.
2. **100% Tag Preservation:**
   - Preserve all original control and cataloging tags:
     - `001`: Original ILS control number / system ID (e.g. `vtls000437338`, Koha `biblionumber`).
     - `035`: System control numbers and OCLC identifiers.
     - `020` / `022`: ISBN and ISSN values (preserve raw text including subfields `$q` for qualifiers).
     - `040`: Original cataloging agency code (e.g. `MY-KLP`, `PPAPP`, `DLC`).
     - `082` / `090` / `852`: Dewey Decimal (DDC) and Library of Congress (LCC) classifications and call numbers.
     - `9xx`: Local provenance and item tags.
3. **Deterministic Output Layout:**
   - Every harvester run emits a standardized folder structure into the ingestion inbox:
     ```text
     harvest/inbox/<source-code>/<run-id>/
     ├── manifest.json
     ├── partition_state.json
     ├── provenance.jsonl
     └── records/
         ├── batch_0.xml
         ├── batch_1.xml
         └── ...
     ```
4. **Tombstone & Takedown Compliance:**
   - Harvesters must check `data/tombstones.json` before writing records. Any catalog item previously removed for legal, copyright, or privacy reasons must be silently skipped to prevent resurrecting deleted items.

---

## 3. The Universal Output Contract

### 3.1 `manifest.json` Specification
The run manifest records batch metadata, execution status, and record counts.

```json
{
  "schema_version": "1.0",
  "source_code": "ppapp",
  "source_name": "Perbadanan Perpustakaan Awam Pulau Pinang",
  "source_base_url": "https://opac.penanglib.gov.my/",
  "terms_url": "https://penanglib.gov.my/terms",
  "terms_verified_on": "2026-10-11",
  "harvester_name": "ppapp-koha-harvester",
  "harvester_version": "1.0.0",
  "run_id": "20261011-060000Z",
  "mode": "full",
  "started_at": "2026-10-11T06:00:00.000Z",
  "finished_at": "2026-10-11T07:15:30.000Z",
  "record_count": 10000,
  "error_count": 0,
  "status": "complete",
  "user_agent": "PustakaTerbuka-Harvester/1.0 (+https://github.com/pustaka-terbuka/ppapp; contact@pustakaterbuka.org)",
  "notes": "Initial full harvest batch"
}
```

* Status values:
  * `"complete"`: All requested pages/records harvested without unrecoverable errors.
  * `"partial"`: Harvest stopped early (e.g. user interrupt, network failure) with $\ge 1$ valid record saved.
  * `"failed"`: Fatal failure before any valid record could be stored.

### 3.2 `records/batch_<n>.xml` Specification
* **Format:** Standard MARC 21 Slim XML wrapping records in `<collection xmlns="http://www.loc.gov/MARC21/slim">`.
* **Encoding:** UTF-8 without Byte Order Mark (BOM).
* **Batch Sizing:** 100 to 1,000 records per XML file (keeps memory low and Git diffs small).
* **Validation Gate:** Every record must contain at least a valid **Control Number (`001` or `035`)** and a **Title (`245 $a`)**. Missing either marks the record as invalid (`error_count` incremented, record discarded).

### 3.3 `provenance.jsonl` Specification
Every record in `records/*.xml` has a corresponding JSON line in `provenance.jsonl` linking the record to its live source URL and harvest timestamp:

```json
{"source_001":"1029384","source_url":"https://opac.penanglib.gov.my/cgi-bin/koha/opac-detail.pl?biblionumber=1029384","harvested_at":"2026-10-11T06:01:23.100Z","file":"batch_0.xml","index":0}
```

---

## 4. Architectural Patterns for Library Adapters

Harvesters should use a **Strategy Pattern** separating the **Universal Runtime Engine** (rate limiting, retry loop, batch writing, resume machine) from the **Source Adapter** (protocol communication and data transformation).

```
┌────────────────────────────────────────────────────────┐
│             Universal Harvester Base Engine            │
│   (Rate Limiter, Retries, Checkpointer, Batch Writer)  │
└───────────────────────────┬────────────────────────────┘
                            │ Calls adapter methods
     ┌──────────────────────┼──────────────────────┐
     ▼                      ▼                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Pattern A:  │     │  Pattern B:  │     │  Pattern C:  │
│   OAI-PMH    │     │   REST API   │     │  Partition   │
│   Adapter    │     │   Adapter    │     │   Crawler    │
│ (Koha, Alma) │     │(Vega, Primo) │     │ (Web OPACs)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Pattern A: OAI-PMH (Preferred for Koha, Alma, DSpace)
* **When to use:** When the institution's ILS exposes an open OAI-PMH endpoint (common in Koha instances at `https://<domain>/cgi-bin/koha/oai.pl`).
* **Protocol Flow:**
  1. `Identify`: Verify repository name, admin email, and protocol version.
  2. `ListMetadataFormats`: Confirm support for `marc21` or `marcxml`.
  3. `ListRecords`: Request records with `metadataPrefix=marc21`.
  4. Pagination is built-in: Extract `<resumptionToken>` from each response and request subsequent pages until the token is empty.
* **Advantages:** Native MARC 21 format, official institutional protocol, zero HTML scraping needed.

### Pattern B: REST API (Vega Discover, Ex Libris Alma, Modern ILS)
* **When to use:** When the library provides a JSON-based REST API for discovery search (e.g., PNM Vega Discover).
* **Protocol Flow:**
  1. Construct query payload with `pageNum` and `pageSize` (typically 50-100 items).
  2. Send `POST` or `GET` with required customer domain and host headers.
  3. Iterate through JSON `data` array and transform JSON objects into MARC 21 Slim XML fields.
* **Transformation Matrix:**
  * Map identifiers &rarr; `001`, `020`, `022`, `035`.
  * Map title/agent/dates &rarr; `100`, `245`, `264`.
  * Map subjects & formats &rarr; `650`, `655`.
  * Map call numbers & locations &rarr; `852`.

### Pattern C: Query Partition Crawler (Closed Web OPACs)
* **When to use:** When no OAI-PMH or REST API exists, and the search interface enforces a pagination ceiling (e.g. OpenSearch 10k window).
* **Protocol Flow:**
  1. **Partitioning:** Subdivide the catalog into bounded search queries:
     * By publication year (e.g. `2024`, `2023`, ...).
     * By alphanumeric prefix (e.g. `a*`, `b*`, ... `z*`, `0*` - `9*`).
     * By broad era ranges for older accessions.
  2. Each query is treated as a separate partition tracking pages `0` through `maxPage`.
  3. Harvested search results link directly to item detail pages or MARC view endpoints.

---

## 5. Operational Guarantees & Network Etiquette

All harvesters must behave as model citizens on institutional library networks:

1. **Politeness Delay:**
   * Minimum delay of **2,000 ms** between requests to external hosts.
   * Delay must be configurable via `--delay <ms>`.
2. **Descriptive User-Agent:**
   * Format:
     ```text
     PustakaTerbuka-Harvester/1.0 (+https://github.com/pustaka-terbuka/<source>; contact@pustakaterbuka.org)
     ```
3. **Exponential Backoff with Jitter:**
   * On HTTP `429`, `502`, `503`, `504`, or socket timeout:
     $$\text{Backoff (ms)} = \min\left(300000,\, 5000 \times 2^{\text{attempt}-1}\right) + \text{random}(0, 2000)$$
   * Retry up to 5 times before halting.
   * If a `Retry-After` header is returned by the server, respect that delay exactly.
4. **Circuit Breaker:**
   * If an endpoint returns continuous failures across 10 consecutive retry cycles, the harvester marks the run status as `"partial"`, seals `manifest.json`, and exits cleanly with exit code `1`.
5. **Stateful Checkpointing & Self-Healing:**
   * All progress is tracked in `partition_state.json`.
   * On startup with `--resume`:
     * Scan existing `records/batch_*.xml`.
     * If a file does not contain a closing `</collection>` tag, delete it.
     * Scrub matching entries from `provenance.jsonl`.
     * Set the next batch counter to `highest_valid_batch + 1`.

---

## 6. Discrete 10k Chunk Pipeline & Ephemeral Mode

For collections exceeding 10,000 records, harvesters should support chunked lifecycle processing:

```mermaid
flowchart TD
    Start([Start Harvest]) --> Fetch[Fetch & Transform Records]
    Fetch --> CheckChunk{Chunk >= 10k records?}
    CheckChunk -- No --> HasMore{More records?}
    HasMore -- Yes --> Fetch
    HasMore -- No --> Seal[Seal Manifest]
    CheckChunk -- Yes --> Seal
    Seal --> Validate[npm run validate-inbox]
    Validate --> Merge[npm run merge]
    Merge --> Build[npm run build]
    Build --> GitPush[git push origin main / gh-pages]
    GitPush --> HasMore
    HasMore -- No --> Done([Finish Run])
```

* **Ephemeral Scratch Mode (`--ephemeral`):**
  * Shallow clones the target repo (`--depth 1`) in a temporary directory.
  * Harvests, validates, merges, and pushes from scratch space.
  * Purges the scratch directory upon completion, leaving 0 MB of persistent local disk footprint.

---

## 7. Step-by-Step: Adding a New Library Harvester

> **Authoritative Onboarding Guide**: For the complete end-to-end specification from registry to UI display, see [docs/ORGANIZATION_WORKFLOW.md](ORGANIZATION_WORKFLOW.md).

Follow this standard procedure when introducing a new library source (e.g. PPAPP):

### Step 1: Register Source in `master/data/sources.json`
Add the organization entry with priority and repo coordinates:
```json
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
```

### Step 2: Register Organization in `master/data/orgs.json`
Add institutional metadata so the organization is displayed in the master OPAC search filter:
```json
"PPAPP": {
  "name": "Perbadanan Perpustakaan Awam Pulau Pinang",
  "state": "Pulau Pinang",
  "type": "public",
  "default_scheme": "DDC",
  "contact": "info@penanglib.gov.my",
  "opac_url": "https://opac.penanglib.gov.my/"
}
```

### Step 3: Implement the Harvester
Create `tools/harvesters/<source-code>/harvester.js` (or `.cs`). Wire standard CLI options:
* `--max-pages <n>`
* `--page-size <n>`
* `--delay <ms>` (default 2000 ms)
* `--mode <full|incremental>`
* `--resume [auto|id]`
* `--fresh`
* Preserve tags: Control number `001`, source agency `003`, cataloging agency `040 $a`, and item holdings (`952` for Koha or `852` for Vega).

### Step 4: Verify with Ingestion Gate
```bash
node tools/validate-inbox.js harvest/inbox/<source-code>/<run-id>/
```
Ensure exit code is `0` and all integrity checks pass.

### Step 5: Merge into Master Shards
```bash
node tools/merge.js harvest/inbox/<source-code>/<run-id>/ --data-dir data
```

### Step 6: Build Master Site & Pagefind Index
```bash
node tools/build.js --data-dir data
```
This generates `dist/org/<ORG>/index.json`, `dist/browse/<ORG>/DDC.json`, and indexes `organization: ['<ORG>']` in Pagefind WASM.

### Step 7: Verify Frontend Dropdown & Filter Browsing
Open `dist/index.html` to confirm `<ORG>` appears in `#org-filter` with working shelf browse links and direct OPAC resolution.

---

## 8. Multi-Organization Harvester Concurrency & Conflict Prevention

In a mature Pustaka Terbuka ecosystem, harvesters for dozens of libraries (`pnm`, `ppapp`, `ppas`, `uitm`, etc.) may run in parallel. The architecture guarantees zero collisions when adhering to these core principles:

### 8.1 Isolation Matrix
1. **Target OPAC Independence:** Each provider scraper connects to a completely distinct host and domain name. Running scrapers simultaneously does not cross-trigger 429 rate limits or firewall bans between institutions.
2. **Repository Decoupling:** Provider scrapers execute in independent repositories and save to isolated inbox directories (`harvest/inbox/<source-code>/`). File writes and git commits are completely partitioned.
3. **Union Catalog Priority Deduplication:** The master catalog resolves cross-library bibliographic overlap (same ISBN or title) automatically during the `master` merge phase using priority ranks defined in `data/sources.json`. Metadata is attributed to the highest-priority source while all institutional holdings (`852`/`952`) are preserved.

### 8.2 Operational Rules
* **Strictly 1 process per institution:** Never launch multiple concurrent scrapers targeting the same library OPAC host.
* **Sequential Master Ingestion:** Run `tools/build.js` sequentially in `master` when ingesting harvested data from provider repositories.
* **Resource footprint:** The 2,000 ms politeness delay ensures Node.js harvesters operate at ~50–80 MB RAM per process, allowing 3–6 concurrent crawlers on a single workstation without system degradation.

