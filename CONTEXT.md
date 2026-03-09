# PulseFeed — Claude Context

## Hvad er PulseFeed?

PulseFeed er et medicinsk nyhedsbrev-system der automatisk importerer videnskabelige artikler fra PubMed, beriger dem med AI, og sender ugentlige nyhedsbreve til læger opdelt på specialer.

## Tech stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | Next.js 16.1.6, React 19.2.3, TypeScript 5 |
| Backend | Next.js API routes (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + custom role-system (admin/editor/viewer) |
| AI | Anthropic Claude (Haiku til scoring, Sonnet til berigelse) |
| Email | Resend |
| Datakilder | PubMed eUtils API, Europe PMC, OpenAlex, Circle 2/3 affiliations |

## Mappestruktur

```
pulsefeed/
├── web/
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── admin/            # Admin-sider
│   │   │   │   ├── (with-header)/        # Route group — har global Header + AlertBanner
│   │   │   │   │   ├── articles/         # Artikel-administration
│   │   │   │   │   ├── authors/          # Forfatter-liste, stamkort, merge
│   │   │   │   │   │   ├── [id]/         # Forfatter-profil
│   │   │   │   │   │   └── merge/        # Forfatter-merge UI (MergeClient.tsx)
│   │   │   │   │   ├── lab/              # AI-træning og scoring
│   │   │   │   │   ├── newsletter/
│   │   │   │   │   └── subscribers/
│   │   │   │   ├── system/               # Har egen Header i system/layout.tsx
│   │   │   │   │   ├── import/           # Import overview (read-only dashboard)
│   │   │   │   │   │   ├── c1/           # Circle 1 import-side
│   │   │   │   │   │   ├── c2/           # Circle 2 import-side
│   │   │   │   │   │   ├── c3/           # Circle 3 import-side
│   │   │   │   │   │   ├── [specialty]/  # Import-statistik pr. specialty
│   │   │   │   │   │   └── CircleImportPage.tsx  # Shared circle-komponent
│   │   │   │   │   ├── cost/             # AI API-forbrug
│   │   │   │   │   ├── alerts/           # System-beskeder
│   │   │   │   │   ├── logs/
│   │   │   │   │   ├── tagging/          # MeSH auto-tagging rules
│   │   │   │   │   ├── author-linking/
│   │   │   │   │   └── layers/[specialty]/
│   │   │   │   ├── layout.tsx            # Auth-only (ingen header)
│   │   │   │   ├── LayerManager.tsx      # Bruges af system/layers
│   │   │   │   └── TrainingClient.tsx    # Bruges af system/layers/training
│   │   │   └── api/              # API-routes
│   │   │       ├── admin/        # Admin endpoints
│   │   │       │   ├── articles/[id]/    # PUT: edit specialty_tags, status
│   │   │       │   ├── authors/
│   │   │       │   │   ├── merge/        # POST: merge duplicate authors
│   │   │       │   │   ├── duplicates/   # GET: find duplicate groups
│   │   │       │   │   ├── details/      # GET: author details with articles
│   │   │       │   │   └── compute-score/# POST: beregn author_score
│   │   │       │   ├── pubmed/           # Import-triggers (C1, C2, C3)
│   │   │       │   ├── import/
│   │   │       │   │   └── circle-stats/ # GET: article counts per circle+status
│   │   │       │   ├── tagging/          # MeSH tagging: activate, disable, run, save-terms, recalculate, batch-approve
│   │   │       │   ├── citations/        # fetch + status
│   │   │       │   ├── impact-factor/    # fetch + status
│   │   │       │   ├── alerts/           # GET/POST/PATCH/DELETE system_alerts
│   │   │       │   ├── cleanup-stuck-jobs/     # POST: nulstil hængte jobs
│   │   │       │   └── circle3-sources/  # GET/PUT circle_3_sources
│   │   │       ├── alerts/       # GET (public): aktive system-alerts
│   │   │       ├── lab/          # Lab (scoring + sessions)
│   │   │       └── internal/     # Cron-jobs
│   │   ├── lib/
│   │   │   ├── supabase/         # DB-klient (admin.ts, client.ts, server.ts, types.ts)
│   │   │   ├── pubmed/           # Import-pipeline
│   │   │   │   ├── importer.ts              # Circle 1 import
│   │   │   │   ├── importer-circle2.ts      # Circle 2 import (per-source loop)
│   │   │   │   ├── importer-circle3.ts      # Circle 3 import (danske neurokirurgi)
│   │   │   │   ├── author-linker.ts         # JSONB → article_authors
│   │   │   │   ├── fetch-citations.ts       # Europe PMC citation count
│   │   │   │   ├── fetch-impact-factors.ts  # OpenAlex impact factor + h_index
│   │   │   │   └── quality-checks.ts        # Data validation
│   │   │   ├── auth/             # require-admin.ts, specialties.ts, schemas.ts, errors.ts
│   │   │   ├── tagging/
│   │   │   │   └── auto-tagger.ts   # MeSH-based auto-tagging
│   │   │   ├── affiliations.ts   # Affiliation parsing
│   │   │   ├── article-events.ts # Article event tracking
│   │   │   └── ai/               # Anthropic tracked-client
│   │   └── components/
│   │       ├── articles/
│   │       │   ├── ArticleStamkort.tsx   # Artikel-stamkort (facts, evidence, authors)
│   │       │   ├── CollapseAuthors.tsx   # Forfatter-liste med score-badges
│   │       │   └── CopyButton.tsx
│   │       ├── lab/
│   │       │   └── PromptDrawer.tsx
│   │       ├── Header.tsx
│   │       ├── AlertBanner.tsx           # Viser aktive system-alerts (client)
│   │       ├── ScoreBadge.tsx
│   │       ├── AuthorSearch.tsx
│   │       └── RelativeTime.tsx
│   └── supabase/
│       └── migrations/           # 0001–0027 SQL-migrationer
```

## Database — vigtigste tabeller

| Tabel | Formål |
|-------|--------|
| `articles` | Artikler fra PubMed — `pubmed_id`, `title`, `abstract`, `authors` (JSONB), `circle`, `specialty_tags`, `status`, `country`, `source_id`, `citation_count`, `impact_factor`, `journal_h_index`, `evidence_score` (generated), `approval_method`, `auto_tagged_at` |
| `authors` | Forfatter-database — `display_name`, `city`, `country`, `specialty`, `affiliations` (TEXT[]), `article_count`, `author_score`, `orcid` |
| `article_authors` | Many-to-many: artikler ↔ forfattere |
| `pubmed_filters` | Circle 1 søge-konfiguration (journal-lister, query_string, specialty) |
| `circle_2_sources` | Circle 2 affiliations (institution/region + max_results) — `articles.source_id` FK |
| `circle_3_sources` | Circle 3 affiliations (danske neurokirurgiske hospitaler) — `specialty`, `type`, `value`, `max_results`, `active` |
| `tagging_rules` | MeSH-baserede auto-tagging regler — `term`, `specialty`, `approval_rate`, `decision_count`, `status` (tracking/draft/active/disabled) |
| `import_logs` | Log pr. import-kørsel — `filter_id`, `circle` (INT), `status`, `articles_imported` |
| `author_linking_logs` | Log pr. forfatter-linking-kørsel — `new_authors`, `duplicates`, `rejected` |
| `rejected_authors` | Forfattere der ikke kunne linkes |
| `system_alerts` | System-beskeder til brugere — `title`, `message`, `type`, `active`, `expires_at` |
| `lab_decisions` | Trænings-verdicts: `decision`, `ai_decision`, `ai_confidence`, `model_version`, `disagreement_reason` |
| `lab_sessions` | Samlet session pr. træningskørsel |
| `model_versions` | Aktive model-versioner pr. specialty+module — `version`, `active`, `prompt` |
| `model_optimization_runs` | AI-optimeringsanalyse — `improved_prompt`, `fp_count`, `fn_count`, `refinement_iterations` (JSONB) |
| `api_usage` | AI API-forbrug — `model_key`, `total_tokens`, `cost_usd`, `called_at` |
| `newsletter_feedback` | Ugentlig feedback på udvalgte artikler |
| `article_events` | Audit trail pr. artikel — `event_type`, `payload` (JSONB) |

### `articles` — beregnede/hentede felter

| Kolonne | Kilde | Opdatering |
|---------|-------|------------|
| `citation_count` | Europe PMC `/MED/{pmid}/citations` | `runCitationFetch()` — 7-dages interval |
| `citations_fetched_at` | — | Sættes ved hvert fetch |
| `impact_factor` | OpenAlex `summary_stats.2yr_mean_citedness` | `runImpactFactorFetch()` — 30-dages interval |
| `journal_h_index` | OpenAlex `summary_stats.h_index` | Samme kørsel som impact_factor |
| `impact_factor_fetched_at` | — | Sættes ved hvert fetch |
| `evidence_score` | **Generated column** (0–100) | Automatisk: 40% citations + 40% IF + 20% H-index |

### `evidence_score` formel
```sql
LEAST(citation_count / 50.0, 1.0) * 40
+ LEAST(impact_factor / 5, 1.0) * 40
+ LEAST(journal_h_index / 360, 1.0) * 20
```

### `author_score`
- Gennemsnit af `evidence_score` på forfatterens artikler
- Kun for forfattere med `article_count >= 3`
- Beregnes via `compute_author_scores()` Postgres-funktion
- Grøn ≥35, orange 15–34, rød <15

### `articles.status`
- `approved` — Godkendt / publiceret
- `pending` — Afventer review
- `rejected` — Afvist

### `articles.approval_method`
- `journal` — Godkendt via C1 journal-match
- `mesh_auto_tag` — Auto-godkendt via MeSH tagging-regel
- `human` — Manuelt godkendt af admin

### `articles.circle`
- `1` — PubMed journal-søgning (`status=approved`, `approval_method=journal`)
- `2` — Affiliation-søgning, kræver Lab-validering (`status=pending`, `source_id` sat)
- `3` — Danske neurokirurgiske hospitaler (`status=pending`, `country="Denmark"`)

## Admin layout-struktur

```
admin/layout.tsx              ← kun auth-redirect (ingen header)
admin/(with-header)/layout.tsx ← Header + AlertBanner
admin/system/layout.tsx       ← Header + AlertBanner (separat — ingen route group)
```

System-sider har **ikke** `(with-header)`-layoutet — de har deres egen header direkte i `system/layout.tsx`.

## Import-pipeline

```
PubMed eUtils (ESearch → EFetch)
    ↓
Upsert i articles-tabellen
    ↓
import_logs oprettes (inkl. circle-kolonne)
    ↓
author-linker: JSONB authors → article_authors (via resolveAuthorId)
    ↓
after(): runCitationFetch(200)   ← automatisk efter C1/C2/C3 import
```

### Circle 1 (`importer.ts`)
- Kører pr. `pubmed_filter` (specialty + journal-liste)
- `status = "approved"`, `approval_method = "journal"`

### Circle 2 (`importer-circle2.ts`)
- **Kører per-source** (én PubMed-kørsel pr. `circle_2_sources`-række)
- `source_id` sættes på hvert artikel til den matchende `circle_2_sources.id`
- Cross-source deduplicering via `seenPmids`-set
- `last_run_at` opdateres per source efter hver kørsel
- `status = "pending"`
- `totalImported` tæller `(upsertedRows ?? []).length` — ikke `batch.length`

### Circle 3 (`importer-circle3.ts`)
- Bygger kombineret query: `("hospitalNavn"[AD] AND neurosurg*[AD]) OR ...`
- Lokal affiliationscheck efter EFetch — begge betingelser på SAMME forfatters affiliation
- `status = "pending"`, `country = "Denmark"`, `specialty_tags = ["neurosurgery"]`
- `totalImported` tæller `(upsertedRows ?? []).length` — ikke `batch.length`

### Author linking (`author-linker.ts`)
- `resolveAuthorId` returnerer `{ id, outcome }` — outcome: `"new" | "duplicate" | "rejected"`
- Forfattere uden `lastName` OG uden `orcid` → `rejected_authors`
- `computeMatchConfidence` threshold: **0.85**

### Citations (`fetch-citations.ts`)
- API: `https://www.ebi.ac.uk/europepmc/webservices/rest/MED/{pmid}/citations?format=json&pageSize=1`
- Returnerer `hitCount`
- 7-dages refresh-interval, 200ms delay mellem kald

### Impact Factor + H-index (`fetch-impact-factors.ts`)
- API: `https://api.openalex.org/sources?filter=issn:{issn}` — **ingen** `select`-param (betalt)
- `impact_factor` ← `summary_stats.2yr_mean_citedness` (gratis)
- `journal_h_index` ← `summary_stats.h_index` (gratis)
- Deduplicerer pr. ISSN — ét API-kald pr. tidsskrift, batch-update alle artikler
- 30-dages refresh-interval

## MeSH Auto-Tagging System

### Koncept
Artikler der importeres via C2/C3 kan auto-godkendes baseret på MeSH-termer fra PubMed. Systemet tracker hvilke MeSH-termer der historisk har ≥100% godkendelsesrate med ≥50 beslutninger.

### Status-flow for `tagging_rules`
```
tracking → draft → active
                 → disabled
```
- **tracking**: Term har <50 beslutninger, data indsamles
- **draft**: ≥50 beslutninger + 100% approval rate, klar til review
- **active**: Godkendt af admin, auto-tagger nye artikler
- **disabled**: Manuelt deaktiveret

### Funktioner
- `recalculate_tagging_rules(p_specialty, p_include_c1)` — genberegner alle regler baseret på lab_decisions data
- `auto-tagger.ts` — kører efter import, matcher artikel-MeSH mod aktive regler
- Godkendte artikler får `approval_method = 'mesh_auto_tag'`, `auto_tagged_at` timestamp

## Import Dashboard (`/admin/system/import`)

Read-only overview med 3 sektioner:

### Sektion 1: Artikler
Tabel med C1/C2/C3 rækker:
| Import-kilde | Approved | Pending | Rejected | Seneste import | Administrér → |
Bruger direkte count-queries: `SELECT count(*) FROM articles WHERE circle=X AND status=Y`

### Sektion 2: Forfattere
KPI-kort: Total forfattere, Ulinket artikler, Seneste linking-kørsel

### Sektion 3: Berigelse
Progress bars for Citations og Impact Factor — viser % artikler med data

### Circle-sider (`/admin/system/import/c1`, `/c2`, `/c3`)
Delt komponent `CircleImportPage.tsx` med:
- Header med circle-badge (C1 blå, C2 lilla, C3 orange)
- KPI-kort (total, pending, approved)
- Konfiguration textarea (journal-liste / affiliations)
- Import-log tabel med polling (3s interval under import)

## Author Merge (`/admin/authors/merge`)

### UI — Lineært 3-step flow (`MergeClient.tsx`)
1. **Duplikat-grupper**: Henter grupper med identisk `display_name` via `/api/admin/authors/duplicates`
2. **Forfatter-kort**: Fulde kort med klikbart navn (→ author-profil), ORCID-link, affiliations, artikelliste
3. **Bekræft merge**: Vælg master via radio buttons → POST `/api/admin/authors/merge` → redirect til master-profil

### Merge API (`/api/admin/authors/merge`)
- Relinker `article_authors` (håndterer unique constraint conflicts)
- Merger affiliations (union af alle)
- Overfører ORCID hvis master mangler
- Genberegner `article_count`
- Sletter duplicate-forfattere

## Lab (AI-træning og model-optimering)

### Filer
| Fil | Formål |
|-----|--------|
| `web/src/app/admin/lab/specialty-tag/dashboard/` | KPI-kort, kalibreringstabel, PatternAnalysis |
| `web/src/app/admin/lab/specialty-tag/evaluation/` | Uenigheder + VersionSelector |
| `web/src/app/admin/lab/specialty-tag/optimize/` | Analyse-workflow (Step 1–2) |
| `web/src/app/admin/lab/specialty-tag/simulate/` | Prompt-simulator (Step 3–4) |
| `web/src/app/api/lab/score-batch/` | SSE-scoring af pending artikler |
| `web/src/app/api/lab/simulate-prompt/` | SSE-scoring mod specifik prompt |
| `web/src/app/api/lab/analyze-patterns/` | AI-analyse af FP/FN-mønstre |
| `web/src/app/api/lab/refine-prompt/` | Iterativ prompt-forfining med ekspert-feedback |
| `web/src/app/api/lab/model-versions/` | Gem og aktiver ny model-version |

### score-batch (`/api/lab/score-batch`)
- `scoreAll: boolean` — når `true`: scorer ALLE pending artikler med forældet `model_version`; `false`: kun artikler med `specialty_confidence IS NULL`
- Begge queries filtreres på `.contains("specialty_tags", [specialty])` — scorer kun artikler tagget med den valgte specialty
- `scoreAll=true`-query bruger `.or("specialty_scored_at.is.null,model_version.is.null,model_version.neq.{v}")` — explicit `model_version.is.null` kræves da SQL `NULL != 'v3'` evaluerer til NULL (ikke TRUE)
- Bruges automatisk efter aktivering af ny model-version (kaldt fra SimulatorClient)
- **AbortController**: `TrainingClient.tsx`-useEffect opretter en AbortController og returnerer `() => abort.abort()` som cleanup — forhindrer React StrictMode double-invocation i at starte to samtidige score-batch-kald

### Simulation (`simulate/SimulatorClient.tsx`)
- **To sektioner**: Fejlrettelse (uenigheder) + Regressionstest (enigheder fra aktiv model)
- **To sekventielle SSE-kald**: først disagreements, derefter agreement-sample
- Kombineret fremskridtslinje over alle artikler
- Regressionsadvarsel: `> 5` regressioner → rød advarsel; `≤ 5` → grøn

### Rejection reasons med TAG_REMAP
| Reason | → tag |
|--------|-------|
| Neuroscience | neuroscience |
| Basic neuro research | basic_neuro_research |
| Oncology | oncology |
| Anesthesiology | anesthesiology |
| ENT | ent |

Øvrige: "Ikke klinisk relevant", "Other" (fritekst) → ingen remap, `status=rejected`.

## Admin-sider

| URL | Formål |
|-----|--------|
| `/admin/system` | System-oversigt (kort til Import, Cost, Alerts) |
| `/admin/system/import` | Import dashboard — read-only overview (artikler, forfattere, berigelse) |
| `/admin/system/import/c1` | Circle 1 import-side (Trusted Journals) |
| `/admin/system/import/c2` | Circle 2 import-side (Extended Sources) |
| `/admin/system/import/c3` | Circle 3 import-side (Danish Sources) |
| `/admin/system/import/[specialty]` | Import-statistik pr. specialty |
| `/admin/system/cost` | AI API-forbrug (tokens + pris pr. call type) |
| `/admin/system/alerts` | Opret/rediger/slet system-alerts |
| `/admin/system/tagging` | MeSH auto-tagging rules management |
| `/admin/system/layers/[specialty]` | C1 filter + C2/C3 affiliation management |
| `/admin/system/author-linking` | Forfatter-linking dashboard |
| `/admin/lab` | Specialty Tag Validation — KPI'er, "Værktøjer"-sektion |
| `/admin/articles` | Artikel-liste med filter + evidence_score badge |
| `/admin/articles/[id]` | Artikel-stamkort: historik + redigerbare tags/status |
| `/admin/authors` | Forfatter-liste sorteret på author_score DESC NULLS LAST |
| `/admin/authors/[id]` | Forfatter-profil med author_score badge + articles |
| `/admin/authors/merge` | Forfatter-merge: duplikat-grupper → kort → bekræft |

## Vigtige konventioner

- **Admin-klient**: Brug altid `createAdminClient()` fra `@/lib/supabase/admin` i server-kode
- **Auth-guard**: `await requireAdmin()` øverst i alle admin API-routes
- **Fire-and-forget**: Import-routes returnerer `{ ok: true }` og kører import i baggrunden (`after()`)
- **TypeScript — manglende Supabase-typer**:
  - For tabeller der ikke er i `types.ts`: `const db = admin as any`
  - For RPC-kald der ikke er i `types.ts`: `(admin as any).rpc("navn", args)` — **ikke** `as never`
  - Kendte manglende typer: `author_score`, `circle_3_sources`, `import_logs.circle`, `tagging_rules`
- **Specialties**: Brug `SPECIALTY_SLUGS` fra `@/lib/auth/specialties` — aldrig hardcode specialty-navne
- **Migrations**: Nummereres `0001`, `0002` osv. — kør manuelt i Supabase SQL Editor efter push
- **AlertBanner**: Fetches `/api/alerts` på mount, bruger `localStorage` til dismiss (`dismissed-alert-{id}`)
- **Circle badge-farver**: C1 blå (`#1d4ed8`), C2 lilla (`#7c3aed`), C3 orange (`#c2410c`)
- **Design tokens**: Inline styles med `#1a1a1a`, `#5a6a85`, `#EEF2F7`, card shadows

## Artikel-events (`article_events`)

| event_type | payload-felter |
|------------|----------------|
| `imported` | circle, status, specialty_tags, filter_name, source_id (C2), import_log_id |
| `enriched` | ai_decision, specialty_confidence, model_version, specialty_tags |
| `lab_decision` | module, editor_verdict, ai_verdict, confidence, disagreement_reason |
| `status_changed` | from, to, changed_by (+ `type: "specialty_tags"` ved tag-ændringer) |
| `author_linked` | authors_linked, new, duplicates, rejected |
| `quality_check` | passed, message |
| `impact_factor_updated` | impact_factor, journal_h_index |
| `citation_count_updated` | citation_count |
| `auto_tagged` | rule_id, term, specialty |

Events vises i admin-stamkort under fanen "Historik" — `impact_factor_updated` og `citation_count_updated` vises i sektionen **Bibliometri**.

## Miljøvariabler (web/.env.local)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
PUBMED_API_KEY
RESEND_API_KEY
NEWSLETTER_FROM_EMAIL
UNSUBSCRIBE_SECRET
CRON_SECRET
NEXT_PUBLIC_SITE_URL
```

## Migrationer

| Fil | Indhold |
|-----|---------|
| `0001–0010` | Grundlæggende: users, keywords, unsubscribe, pubmed, articles v2, filters, dates, ISSN |
| `0011–0016` | Authors-system: authors-tabel, users_author_id, article_count trigger, structured fields, profiles, roles |
| `0017–0019` | Layer-arkitektur, pubmed_filters journal_list, circle2 max_results |
| `0021–0022` | Fix circle2 specialty_tags, training decisions comment |
| `0023` | `circle1_verified_true` — C1 auto-approval setup |
| `0024` | `tagging_rules`-tabel + `recalculate_tagging_rules()` funktion |
| `0025` | Tagging rules: tracking status for regler under threshold |
| `0026` | `recalculate_tagging_rules` udvidet med `p_include_c1` parameter |
| `0027` | `approval_method` kolonne (journal/mesh_auto_tag/human) + `auto_tagged_at` |

Ældre migrationer (0046–0064) er renummereret/sammenlagt — de nuværende 0001–0027 er den aktive migration-serie.
