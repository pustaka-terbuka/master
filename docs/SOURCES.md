# Data Sources & State Library Harvesters Registry

Comprehensive technical directory of Malaysian national and state public library catalog systems, endpoints, protocols, identifiers, and harvester implementations.

---

## 1. Perpustakaan Negara Malaysia (PNM)

- **Source Code**: `pnm`
- **Prefix / Agency**: `PNM` / `MY-KLP`
- **Priority**: 10
- **Base OPAC URL**: `https://opac.pnm.gov.my/`
- **Terms URL**: `https://www.pnm.gov.my/`
- **Platform**: Innovative Interfaces Vega Discover REST API (`https://ap.iiivega.com/api/search-result/search/format-groups`)
- **Protocol**: HTTPS POST JSON with custom headers (`iii-customer-domain: pnm.ap.iiivega.com`, `iii-host-domain: opac.pnm.gov.my`, `api-version: 2`).
- **Identifiers**: Control number `001` (`identifiers.local` / `vtls...`), ISBN (`020 $a`), ISSN (`022 $a`).
- **Harvester**: `tools/harvesters/pnm/harvester.js` (`npm run harvest:pnm`)

---

## 2. Perbadanan Perpustakaan Awam Pulau Pinang (PPAPP)

- **Source Code**: `ppapp`
- **Prefix / Agency**: `PPAPP`
- **Priority**: 8
- **Base OPAC URL**: `https://opac.penanglib.gov.my/`
- **Terms URL**: `https://www.penanglib.gov.my/`
- **Platform**: Koha ILS
- **Protocol**: HTTP GET direct MARCXML export (`/cgi-bin/koha/opac-export.pl?op=export&bib={bib}&format=marcxml`).
- **Holdings**: Embedded in Koha MARC `952` (`$o` call number, `$a`/`$b` branch, `$p` barcode).
- **Harvester**: `tools/harvesters/ppapp/harvester.js` (`npm run harvest:ppapp`)

---

## 3. Perbadanan Perpustakaan Awam Selangor (PPAS)

- **Source Code**: `ppas`
- **Prefix / Agency**: `PPAS`
- **Priority**: 7
- **Base OPAC URL**: `https://ppas.ap.iiivega.com/`
- **Terms URL**: `https://www.ppas.gov.my/`
- **Platform**: Innovative Interfaces Vega Discover REST API (`https://ap.iiivega.com/api/search-result/search/format-groups`)
- **Protocol**: HTTPS POST JSON (`iii-customer-domain: ppas.ap.iiivega.com`).
- **Holdings**: Embedded in MARC `852` (`$h` call number, `$b` branch location).
- **Harvester**: `tools/harvesters/ppas/harvester.js` (`npm run harvest:ppas`)

---

## 4. Perbadanan Perpustakaan Awam Johor (PPAJ)

- **Source Code**: `ppaj`
- **Prefix / Agency**: `PPAJ`
- **Priority**: 7
- **Base OPAC URL**: `https://seal.ppaj.gov.my/webopac`
- **Terms URL**: `https://ppaj.johor.gov.my/`
- **Platform**: SEAL Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ppaj/harvester.js` (`npm run harvest:ppaj`)

---

## 5. Perbadanan Perpustakaan Awam Kedah (PPAK)

- **Source Code**: `ppak`
- **Prefix / Agency**: `PPAK`
- **Priority**: 8
- **Base OPAC URL**: `http://catalog.kedahlib.gov.my/`
- **Terms URL**: `http://www.kedahlib.gov.my/`
- **Platform**: Koha ILS
- **Protocol**: Koha MARCXML Export & OPAC Detail interface.
- **Harvester**: `tools/harvesters/ppak/harvester.js` (`npm run harvest:ppak`)

---

## 6. Perbadanan Perpustakaan Awam Kelantan (PPANK)

- **Source Code**: `ppank`
- **Prefix / Agency**: `PPANK`
- **Priority**: 8
- **Base OPAC URL**: `http://catalog.kelantanlibrary.gov.my/`
- **Terms URL**: `https://www.kelantanlibrary.gov.my/`
- **Platform**: Koha ILS
- **Protocol**: Koha MARCXML Export & OPAC Detail interface.
- **Harvester**: `tools/harvesters/ppank/harvester.js` (`npm run harvest:ppank`)

---

## 7. Perbadanan Perpustakaan Awam Melaka (PERPUSTAM)

- **Source Code**: `perpustam`
- **Prefix / Agency**: `PERPUSTAM`
- **Priority**: 7
- **Base OPAC URL**: `https://perpustam.gov.my/`
- **Terms URL**: `https://perpustam.gov.my/`
- **Platform**: eQuip / Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/perpustam/harvester.js` (`npm run harvest:perpustam`)

---

## 8. Perbadanan Perpustakaan Awam Negeri Sembilan (PPANS)

- **Source Code**: `ppans`
- **Prefix / Agency**: `PPANS`
- **Priority**: 7
- **Base OPAC URL**: `https://www.nslibrary.gov.my/`
- **Terms URL**: `https://www.nslibrary.gov.my/`
- **Platform**: Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ppans/harvester.js` (`npm run harvest:ppans`)

---

## 9. Perbadanan Perpustakaan Awam Pahang (PPAP)

- **Source Code**: `ppap`
- **Prefix / Agency**: `PPAP`
- **Priority**: 7
- **Base OPAC URL**: `https://webopac.pahanglibrary.gov.my/`
- **Terms URL**: `https://pahanglibrary.gov.my/`
- **Platform**: Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ppap/harvester.js` (`npm run harvest:ppap`)

---

## 10. Perbadanan Perpustakaan Awam Negeri Perak (PPANPK)

- **Source Code**: `ppanpk`
- **Prefix / Agency**: `PPANPK`
- **Priority**: 8
- **Base OPAC URL**: `https://pintar.ppanpk.gov.my/`
- **Terms URL**: `https://ppanpk.gov.my/`
- **Platform**: Koha ILS / PINTAR
- **Protocol**: Koha MARCXML Export & OPAC Detail interface.
- **Harvester**: `tools/harvesters/ppanpk/harvester.js` (`npm run harvest:ppanpk`)

---

## 11. Perbadanan Perpustakaan Awam Negeri Perlis (PPANPS)

- **Source Code**: `ppanps`
- **Prefix / Agency**: `PPANPS`
- **Priority**: 7
- **Base OPAC URL**: `http://opac.perlislib.gov.my/`
- **Terms URL**: `https://www.perlislib.gov.my/`
- **Platform**: Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ppanps/harvester.js` (`npm run harvest:ppanps`)

---

## 12. Perpustakaan Negeri Sabah (SSL)

- **Source Code**: `ssl`
- **Prefix / Agency**: `SSL`
- **Priority**: 7
- **Base OPAC URL**: `https://library.sabah.gov.my/`
- **Terms URL**: `https://library.sabah.gov.my/`
- **Platform**: Web OPAC 2.0 / ILMU
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ssl/harvester.js` (`npm run harvest:ssl`)

---

## 13. Pustaka Negeri Sarawak (SARAWAK)

- **Source Code**: `sarawak`
- **Prefix / Agency**: `SARAWAK`
- **Priority**: 8
- **Base OPAC URL**: `https://www.librarynet.com.my/`
- **Terms URL**: `https://www.pustaka-sarawak.com/`
- **Platform**: Angka.sa2 / LibraryNet
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/sarawak/harvester.js` (`npm run harvest:sarawak`)

---

## 14. Perbadanan Perpustakaan Awam Terengganu (PPAT)

- **Source Code**: `ppat`
- **Prefix / Agency**: `PPAT`
- **Priority**: 7
- **Base OPAC URL**: `http://www.trglib.gov.my:2525/`
- **Terms URL**: `https://www.trglib.gov.my/`
- **Platform**: Web OPAC
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/ppat/harvester.js` (`npm run harvest:ppat`)

---

## 15. Perpustakaan Kuala Lumpur (PKL)

- **Source Code**: `pkl`
- **Prefix / Agency**: `PKL`
- **Priority**: 8
- **Base OPAC URL**: `https://perpustakaankualalumpur.dbkl.gov.my/`
- **Terms URL**: `https://perpustakaankualalumpur.dbkl.gov.my/`
- **Platform**: SirsiDynix Symphony Enterprise
- **Classification**: Dewey Decimal Classification (DDC)
- **Harvester**: `tools/harvesters/pkl/harvester.js` (`npm run harvest:pkl`)

---

## 16. Academic Libraries of Malaysia (Universiti Awam & Premier IPTS)

Academic libraries in Malaysia form the higher-education tier of the national union catalog. Unlike public and school libraries that primarily utilize Dewey Decimal Classification (DDC), academic libraries in Malaysia standardize on **Library of Congress Classification (LCC)** and predominantly operate on **Koha ILS** or enterprise discovery platforms.

### 16.1 Public Universities (Universiti Awam - UA / IPTA)

| Code | Agency | University & Library Name | State | Default Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `um` | `UM` | Perpustakaan Universiti Malaya | Kuala Lumpur | LCC | 9 | `npm run harvest:um` |
| `usm` | `USM` | Perpustakaan Hamzah Sendut (USM) | Pulau Pinang | LCC | 9 | `npm run harvest:usm` |
| `ukm` | `UKM` | Perpustakaan Tun Seri Lanang (UKM) | Selangor | LCC | 9 | `npm run harvest:ukm` |
| `upm` | `UPM` | Perpustakaan Sultan Abdul Samad (UPM) | Selangor | LCC | 9 | `npm run harvest:upm` |
| `utm` | `UTM` | Perpustakaan Sultanah Zanariah (UTM) | Johor | LCC | 9 | `npm run harvest:utm` |
| `uitm` | `UiTM` | Perpustakaan Tun Abdul Razak (UiTM) | Selangor | LCC | 8 | `npm run harvest:uitm` |
| `iium` | `IIUM` | Dar al-Hikmah Library (IIUM) | Selangor | LCC | 8 | `npm run harvest:iium` |
| `uum` | `UUM` | Perpustakaan Sultanah Bahiyah (UUM) | Kedah | LCC | 8 | `npm run harvest:uum` |
| `unimas` | `UNIMAS` | Perpustakaan UNIMAS | Sarawak | LCC | 8 | `npm run harvest:unimas` |
| `ums` | `UMS` | Perpustakaan Universiti Malaysia Sabah | Sabah | LCC | 8 | `npm run harvest:ums` |
| `upsi` | `UPSI` | Perpustakaan Tuanku Bainun (UPSI) | Perak | LCC | 8 | `npm run harvest:upsi` |
| `usim` | `USIM` | Perpustakaan USIM | Negeri Sembilan | LCC | 8 | `npm run harvest:usim` |
| `umt` | `UMT` | Perpustakaan Sultanah Nur Zahirah (UMT) | Terengganu | LCC | 8 | `npm run harvest:umt` |
| `uthm` | `UTHM` | Perpustakaan Tunku Tun Aminah (UTHM) | Johor | LCC | 8 | `npm run harvest:uthm` |
| `utem` | `UTeM` | Perpustakaan UTeM | Melaka | LCC | 8 | `npm run harvest:utem` |
| `umpsa` | `UMPSA` | Perpustakaan UMPSA | Pahang | LCC | 8 | `npm run harvest:umpsa` |
| `unimap` | `UniMAP` | Perpustakaan Tuanku Fauziah (UniMAP) | Perlis | LCC | 8 | `npm run harvest:unimap` |
| `unisza` | `UniSZA` | Perpustakaan Al-Wathiqu Billah (UniSZA) | Terengganu | LCC | 8 | `npm run harvest:unisza` |
| `umk` | `UMK` | Perpustakaan Universiti Malaysia Kelantan | Kelantan | LCC | 8 | `npm run harvest:umk` |
| `upnm` | `UPNM` | Perpustakaan UPNM | Kuala Lumpur | LCC | 8 | `npm run harvest:upnm` |

### 16.2 Leading Private Research Universities (PERPUN Members)

| Code | Agency | University & Library Name | State | Default Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `utp` | `UTP` | Information Resource Centre (UTP) | Perak | LCC | 8 | `npm run harvest:utp` |
| `mmu` | `MMU` | Siti Hasmah Digital Library (MMU) | Selangor | LCC | 8 | `npm run harvest:mmu` |
| `uniten` | `UNITEN` | Perpustakaan UNITEN | Selangor | LCC | 8 | `npm run harvest:uniten` |
| `utar` | `UTAR` | UTAR Library | Perak | LCC | 8 | `npm run harvest:utar` |
| `sunway` | `SUNWAY` | Sunway Campus Library | Selangor | LCC | 8 | `npm run harvest:sunway` |
| `taylors` | `TAYLORS` | Taylor's University Library | Selangor | LCC | 8 | `npm run harvest:taylors` |

### 16.3 Common CLI Options for Academic Harvesters

Every academic library harvester adheres to the universal CLI contract:
```bash
node tools/harvesters/<source>/harvester.js --start-bib 1 --end-bib 50000 --max-records 100 --delay 2000
```
- `--start-bib <num>`: First record / biblionumber to harvest.
- `--end-bib <num>`: Last record / biblionumber to harvest.
- `--max-records <num>`: Early limit for test runs.
- `--delay <ms>`: Request throttle delay in milliseconds (default: 2,000 ms).
- `--chunk-size <num>`: Records per chunk (default: 10,000).
- `--master-digest`: Automatically validate, merge, and index into Master on each chunk pause.
- `--resume [auto|id]`: Resume an interrupted harvest run.

---

## 17. Extended Malaysian Library Harvesters Registry

The extended tier expands Pustaka Terbuka into federal territories, parliament & legal bodies, national special & research institutes, technical & private universities, school networks, and scholarly repositories.

### 17.1 Federal Territory & Legal / Parliamentary Libraries

| Code | Agency | Institution & Library Name | State | Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `putrajaya` | `PPJ` | Perpustakaan Perbadanan Putrajaya | Putrajaya | DDC | 8 | `npm run harvest:putrajaya` |
| `labuan` | `PAPL` | Perpustakaan Awam Perbadanan Labuan | Labuan | DDC | 7 | `npm run harvest:labuan` |
| `parlimen` | `PARLIMEN` | Perpustakaan Parlimen Malaysia | Kuala Lumpur | LCC | 9 | `npm run harvest:parlimen` |
| `kehakiman` | `KEHAKIMAN` | Perpustakaan Mahkamah Persekutuan Malaysia (Istana Kehakiman) | Putrajaya | LCC | 8 | `npm run harvest:kehakiman` |
| `barcouncil` | `BARCOUNCIL` | Perpustakaan Majlis Peguam Malaysia | Kuala Lumpur | DDC | 8 | `npm run harvest:barcouncil` |

### 17.2 National Special & Research Institutes

| Code | Agency | Institution & Library Name | State | Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `dbp` | `DBP` | Pusat Dokumentasi Melayu (Dewan Bahasa dan Pustaka) | Kuala Lumpur | DDC | 9 | `npm run harvest:dbp` |
| `bnm` | `BNM` | Bank Negara Malaysia Knowledge Management Centre | Kuala Lumpur | LCC | 9 | `npm run harvest:bnm` |
| `intan` | `INTAN` | Perpustakaan Institut Tadbiran Awam Negara | Kuala Lumpur | DDC | 8 | `npm run harvest:intan` |
| `frim` | `FRIM` | Perpustakaan Institut Penyelidikan Perhutanan Malaysia | Selangor | LCC | 8 | `npm run harvest:frim` |
| `mardi` | `MARDI` | Perpustakaan Institut Penyelidikan & Kemajuan Pertanian | Selangor | DDC | 8 | `npm run harvest:mardi` |
| `mpob` | `MPOB` | Perpustakaan Lembaga Minyak Sawit Malaysia | Selangor | LCC | 8 | `npm run harvest:mpob` |
| `nih` | `NIH` | Perpustakaan National Institutes of Health / IMR | Selangor | LCC | 8 | `npm run harvest:nih` |
| `arkib` | `ARKIB` | Perpustakaan Rujukan Arkib Negara Malaysia | Kuala Lumpur | DDC | 9 | `npm run harvest:arkib` |
| `muzium` | `MUZIUM` | Perpustakaan Jabatan Muzium Malaysia | Kuala Lumpur | DDC | 8 | `npm run harvest:muzium` |

### 17.3 Tertiary, Technical & Branch Universities

| Code | Agency | University & Library Name | State | Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `unikl` | `UNIKL` | Universiti Kuala Lumpur Library Network | Kuala Lumpur | LCC | 8 | `npm run harvest:unikl` |
| `oum` | `OUM` | Tan Sri Dr. Abdullah Sanusi Digital Library (OUM) | Selangor | LCC | 8 | `npm run harvest:oum` |
| `wou` | `WOU` | Tun Dr Lim Keng Yaik Digital Library (WOU) | Pulau Pinang | LCC | 8 | `npm run harvest:wou` |
| `ucsi` | `UCSI` | UCSI University Library & Information Centre | Kuala Lumpur | LCC | 8 | `npm run harvest:ucsi` |
| `apu` | `APU` | Asia Pacific University Library | Kuala Lumpur | LCC | 8 | `npm run harvest:apu` |
| `inti` | `INTI` | INTI International University Library | Negeri Sembilan | LCC | 8 | `npm run harvest:inti` |
| `monashmy` | `MONASHMY` | Monash University Malaysia Library | Selangor | LCC | 9 | `npm run harvest:monashmy` |
| `nottmy` | `NOTTMY` | University of Nottingham Malaysia Library | Selangor | LCC | 9 | `npm run harvest:nottmy` |
| `curtinmy` | `CURTINMY` | The Library, Curtin University Malaysia | Sarawak | LCC | 8 | `npm run harvest:curtinmy` |
| `swinmy` | `SWINMY` | Swinburne University Sarawak Library | Sarawak | LCC | 8 | `npm run harvest:swinmy` |
| `politeknik` | `JPPKK` | Perpustakaan JPPKK (Politeknik & Kolej Komuniti TVET) | Putrajaya | LCC | 8 | `npm run harvest:politeknik` |
| `ipg` | `IPG` | Pusat Sumber Institut Pendidikan Guru Malaysia (27 Kampus) | Kuala Lumpur | DDC | 8 | `npm run harvest:ipg` |

### 17.4 School Systems & National Scholarly Repositories

| Code | Agency | Organization & Portal Name | State | Scheme | Priority | Harvester Command |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `pssslims` | `PSSSLIMS` | Pusat Sumber Sekolah (Generic SLiMS Engine) | Kuala Lumpur | DDC | 7 | `npm run harvest:pssslims` |
| `mrsm` | `MRSM` | Pusat Sumber Maktab Rendah Sains MARA (55+ Maktab) | Kuala Lumpur | DDC | 8 | `npm run harvest:mrsm` |
| `myto` | `MYTO` | Malaysian Theses Online (PNM / PERPUN) | Kuala Lumpur | LCC | 9 | `npm run harvest:myto` |
| `myjurnal` | `MYJURNAL` | MyJurnal (Pusat Sitasi Malaysia / KPT) | Putrajaya | DDC | 9 | `npm run harvest:myjurnal` |


