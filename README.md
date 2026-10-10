# Pustaka Terbuka — Master Hub & Union Catalog

> **PustakaTerbuka: an open, shared MARC catalog for Malaysian schools and libraries.**  
> *Katalog Induk Kebangsaan: An open, federated MARC catalog and static OPAC for Malaysian schools and libraries.*

This repository is the central search engine, OPAC portal, and catalog aggregator for the **[Pustaka Terbuka Organization](https://github.com/pustaka-terbuka)**. It combines and deduplicates bibliographic records from participating library data providers (such as Perpustakaan Negara Malaysia), generates client-side [Pagefind](https://pagefind.app) search indices, and serves a static OPAC on GitHub Pages.

---

## Architecture


The Pustaka Terbuka ecosystem uses an autonomous multi-repository architecture:

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Pustaka Terbuka Hub                        │
│                 (pustaka-terbuka/master)                        │
│  - Static Search UI & OPAC (Pagefind WASM)                      │
│  - Cross-institutional Deduplication & Merging                  │
│  - Universal MARCXML & Copy Cataloging Endpoints                │
└────────────────────────────────┬────────────────────────────────┘
                                 ▲
                                 │ Ingests & Merges
          ┌──────────────────────┴──────────────────────┐
          │                                             │
┌─────────────────────────┐                 ┌─────────────────────────┐
│       pnm/ Repo         │                 │  (Future Member Repos)  │
│ Perpustakaan Negara MY  │                 │  ppapp, schools, etc.   │
│ 422k MARCXML Records    │                 │ Local holdings & MARC   │
└─────────────────────────┘                 └─────────────────────────┘
```

- **[pustaka-terbuka/master](https://github.com/pustaka-terbuka/master)** (This repository) — OPAC frontend, aggregation tools, deduplication pipeline, test suite, and portal deployment.
- **[pustaka-terbuka/pnm](https://github.com/pustaka-terbuka/pnm)** — Official Perpustakaan Negara Malaysia catalog repository (422k+ sharded MARCXML records).

---

## What It Provides

- **Static OPAC**: Client-side full-text search via [Pagefind](https://pagefind.app), browsable by organization, Dewey Decimal (DDC), and Library of Congress (LCC) classifications.
- **Copy Cataloging API**: Real-time static endpoints for ISBN (`/isbn/{isbn}.xml`), ISSN (`/issn/{issn}.xml`), and permanent IDs (`/id/{id}.xml`) with preserved source tags and attribution.
- **Bulk Releases**: ISO-2709 (`.mrc`) and MARCXML (`.xml`) collections published to GitHub Releases for client-side local database caching.
- **Multi-Tenant Holdings**: Participating schools and libraries maintain their physical holdings joined seamlessly with master bibliographic records.
- **Zero-Server Operations**: 100% static hosting on GitHub Pages with release assets on GitHub Releases.

---

## Quick Start

### Prerequisites
- Node.js 20+ (LTS recommended)
- PowerShell 7+
- Git with `core.longpaths` enabled

### Installation
```powershell
git clone https://github.com/pustaka-terbuka/master.git
cd master
npm install
cp config/config.example.json config/config.json
```

### Run Tests
```powershell
npm test
```

### Build Portal & Search Index
```powershell
npm run build
```

---

## Client & LMS Integration

If you are developing a **Library Management System client** (such as a custom .NET Framework Windows Forms application for Windows 7+, SLiMS, Koha, or mobile cataloging):
- **Real-Time Copy Cataloging**: Query `https://pustaka-terbuka.github.io/master/isbn/{isbn}.xml`
- **Offline / Rural Caching**: Ingest release dumps into local SQLite via streaming `XmlReader` (< 25MB RAM on Windows 7).
- **Client Contributions**: Export local holdings and new records as offline `.zip` contribution packages.

See the complete [Client Developer Integration Guide](docs/CLIENT_DEVELOPER_GUIDE.md) for full C# code recipes and integration workflows.

---

## Quick Start for Librarians (Participating Schools)

To add your school or library to PustakaTerbuka or update your holdings:

1. Register or update your organization in `data/orgs.json`
2. Create or update your holdings file at `data/holdings/<YOUR_ORG>.csv`
3. Submit a pull request to the `main` branch (or export an offline contribution package).

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on submitting and updating holdings.

### Link to Your Organization's View
```
https://pustaka-terbuka.github.io/master/?org=YourOrgCode
```

---

## Comprehensive Documentation Suite

- **[AI Agent Master Architecture Guide](docs/AI_AGENT_GUIDE.md)** — Invariants, directory map, data schemas, and pipeline gates for autonomous AI agents.
- **[Client Developer Integration Guide](docs/CLIENT_DEVELOPER_GUIDE.md)** — Point lookups, attribution tags, offline SQLite caching, and UI workflows.
- **[Harvester Standards & Ingestion Contract](docs/HARVESTERS.md)** — Specifications for harvesters, inbox contracts, and strict tag preservation.
- **[Harvester Chunk Lifecycle](docs/HARVESTER_CHUNK_LIFECYCLE.md)** — Batch harvest and deployment architecture for PNM.
- **[Runbook](docs/RUNBOOK.md)** — Operational runbook for deploying and recovering releases.
- **[Sources](docs/SOURCES.md)** — Ingestion source notes and terms of use.
- **[Design Decisions](docs/DECISIONS.md)** — Architectural decision log (ADR).
- **[Contributing](CONTRIBUTING.md)** — Guidelines for library and code contributors.
- **[Data License](docs/DATA_LICENSE.md)** — Public domain / ODC-By data terms.
- **[Takedown Process](docs/TAKEDOWN.md)** — Rights clearance and takedown procedures.

---

## License

MIT License — see [LICENSE](LICENSE). Bibliographic data adheres to [ODC-By 1.0](docs/DATA_LICENSE.md).
