# PulseFeed — Claude Context

## Hvad er PulseFeed?

PulseFeed er et medicinsk nyhedsbrev-system der automatisk importerer videnskabelige artikler fra PubMed, beriger dem med AI, og sender ugentlige nyhedsbreve til læger opdelt på specialer.

## Tech stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | Next.js 15, React 19, TypeScript 5 |
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
│   │   │   │   │   ├── authors/          # Forfatter-liste og stamkort
│   │   │   │   │   ├── lab/              # AI-træning og scoring
│   │   │   │   │   ├── newsletter/
│   │   │   │   │   └── subscribers/
│   │   │   │   ├── system/               # Har egen Header i system/layout.tsx
│   │   │   │   │   ├── import/           # Import dashboard
│   │   │   │   │   ├── cost/             # AI API-forbrug
│   │   │   │   │   ├── alerts/           # System-beskeder
│   │   │   │   │   ├── logs/
│   │   │   │   │   ├── author-linking/
│   │   │   │   │   └── layers/[specialty]/
│   │   │   │   ├── layout.tsx            # Auth-only (ingen header)
│   │   │   │   ├── LayerManager.tsx      # Bruges af system/layers
│   │   │   │   └── TrainingClient.tsx    # Bruges af system/layers/training
│   │   │   └── api/              # API-routes
│   │   │       ├── admin/        # Admin endpoints
│   │   │       │   ├── articles/[id]/    # PUT: edit specialty_tags, status, verified
│   │   │       │   ├── pubmed/           # Import-triggers (C1, C2, C3)
│   │   │       │   ├── citations/        # fetch + status
│   │   │       │   ├── impact-factor/    # fetch + status
│   │   │       │   ├── authors/compute-score/  # POST: beregn author_score
│   │   │       │   ├── alerts/           # GET/POST/PATCH/DELETE system_alerts
│   │   │       │   ├── cleanup-stuck-jobs/     # POST: nulstil hængte jobs
│   │   │       │   └── circle3-sources/  # GET/PUT circle_3_sources
│   │   │       ├── alerts/       # GET (public): aktive system-alerts
│   │   │       ├── lab/          # Lab (scoring + sessions)
│   │   │       └── internal/     # Cron-jobs
│   │   ├── lib/
│   │   │   ├── supabase/         # DB-klient (admin.ts, client.ts, types.ts)
│   │   │   ├── pubmed/           # Import-pipeline
│   │   │   │   ├── importer.ts              # Circle 1 import
│   │   │   │   ├── importer-circle2.ts      # Circle 2 import (per-source loop)
│   │   │   │   ├── importer-circle3.ts      # Circle 3 import (danske neurokirurgi)
│   │   │   │   ├── author-linker.ts         # JSONB → article_authors
│   │   │   │   ├── fetch-citations.ts       # Europe PMC citation count
│   │   │   │   └── fetch-impact-factors.ts  # OpenAlex impact factor + h_index
│   │   │   ├── auth/             # require-admin.ts, specialties.ts
│   │   │   ├── affiliations.ts   # Affiliation parsing
│   │   │   └── ai/               # Anthropic tracked-client
│   │   └── components/
│   │       ├── articles/
│   │       │   ├── ArticleStamkort.tsx   # Artikel-stamkort (facts, evidence, authors)
│   │       │   └── CollapseAuthors.tsx   # Forfatter-liste med score-badges
│   │       ├── Header.tsx
│   │       └── AlertBanner.tsx           # Viser aktive system-alerts (client)
│   └── supabase/
│       └── migrations/           # 0001–0064 SQL-migrationer
```

## Database — vigtigste tabeller

| Tabel | Formål |
|-------|--------|
| `articles` | Artikler fra PubMed — `pubmed_id`, `title`, `abstract`, `authors` (JSONB), `circle`, `specialty_tags`, `status`, `verified`, `country`, `source_id`, `citation_count`, `impact_factor`, `journal_h_index`, `evidence_score` (generated) |
| `authors` | Forfatter-database — `display_name`, `city`, `country`, `specialty`, `affiliations` (TEXT[]), `article_count`, `author_score` |
| `article_authors` | Many-to-many: artikler ↔ forfattere |
| `pubmed_filters` | Circle 1 søge-konfiguration (journal-lister, query_string, specialty) |
| `circle_2_sources` | Circle 2 affiliations (institution/region + max_results) — `articles.source_id` FK |
| `circle_3_sources` | Circle 3 affiliations (danske neurokirurgiske hospitaler) — `specialty`, `type`, `value`, `max_results`, `active` |
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

### `articles.circle`
- `1` — PubMed journal-søgning (`status=approved`, `verified=true`)
- `2` — Affiliation-søgning, kræver Lab-validering (`status=pending`, `verified=false`, `source_id` sat)
- `3` — Danske neurokirurgiske hospitaler (`status=pending`, `verified=false`, `country="Denmark"`)

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
- `status = "approved"`, `verified = true`

### Circle 2 (`importer-circle2.ts`)
- **Kører per-source** (én PubMed-kørsel pr. `circle_2_sources`-række)
- `source_id` sættes på hvert artikel til den matchende `circle_2_sources.id`
- Cross-source deduplicering via `seenPmids`-set
- `last_run_at` opdateres per source efter hver kørsel
- `status = "pending"`, `verified = false`
- `totalImported` tæller `(upsertedRows ?? []).length` — ikke `batch.length`

### Circle 3 (`importer-circle3.ts`)
- Bygger kombineret query: `("hospitalNavn"[AD] AND neurosurg*[AD]) OR ...`
- Lokal affiliationscheck efter EFetch — begge betingelser på SAMME forfatters affiliation
- `status = "pending"`, `verified = false`, `country = "Denmark"`, `specialty_tags = ["neurosurgery"]`
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

## Import Dashboard — sektioner

| Sektion | Subset | Actions |
|---------|--------|---------|
| Artikler | `articles` | Kør C1/C2/C3 import |
| Forfattere | `linking` + `author-score` | Kør forfatter-linking, Beregn forfatter-scores |
| Citations | `citations` | Hent citations (med polling) |
| Impact Factor | `impact-factor` | Hent impact factor (med polling) |

Polling-mønster: snapshot count → poll hvert 3s → stop efter 3 stabile polls.

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
| `/admin/system/import` | Import dashboard med stats + action-knapper |
| `/admin/system/import/[specialty]` | Import-statistik pr. specialty |
| `/admin/system/cost` | AI API-forbrug (tokens + pris pr. call type) |
| `/admin/system/alerts` | Opret/rediger/slet system-alerts |
| `/admin/system/layers/[specialty]` | C1 filter + C2/C3 affiliation management |
| `/admin/system/author-linking` | Forfatter-linking dashboard |
| `/admin/lab` | Specialty Tag Validation — KPI'er (bearbejdet/version, uenigheder%), "Værktøjer"-sektion med Performance + Prompt evaluation |
| `/admin/articles` | Artikel-liste med filter + evidence_score badge |
| `/admin/articles/[id]` | Artikel-stamkort: historik + redigerbare tags/status/verified |
| `/admin/authors` | Forfatter-liste sorteret på author_score DESC NULLS LAST |
| `/admin/authors/[id]` | Forfatter-profil med author_score badge + articles |

## Vigtige konventioner

- **Admin-klient**: Brug altid `createAdminClient()` fra `@/lib/supabase/admin` i server-kode
- **Auth-guard**: `await requireAdmin()` øverst i alle admin API-routes
- **Fire-and-forget**: Import-routes returnerer `{ ok: true }` og kører import i baggrunden (`after()`)
- **TypeScript — manglende Supabase-typer**:
  - For tabeller der ikke er i `types.ts`: `const db = admin as any`
  - For RPC-kald der ikke er i `types.ts`: `(admin as any).rpc("navn", args)` — **ikke** `as never`
- **replace_article_specialty_tags RPC**: Bruges når specialty_tags skal erstattes rent. Kræver alle 4 args: `p_article_id`, `p_tags`, `p_verified`, `p_status`.
- **Specialties**: Brug `SPECIALTY_SLUGS` fra `@/lib/auth/specialties` — aldrig hardcode specialty-navne
- **Migrations**: Nummereres `0001`, `0002` osv. — kør manuelt i Supabase SQL Editor efter push
- **AlertBanner**: Fetches `/api/alerts` på mount, bruger `localStorage` til dismiss (`dismissed-alert-{id}`)

## Artikel-events (`article_events`)

| event_type | payload-felter |
|------------|----------------|
| `imported` | circle, status, specialty_tags, filter_name, source_id (C2), import_log_id |
| `enriched` | ai_decision, specialty_confidence, model_version, specialty_tags |
| `lab_decision` | module, editor_verdict, ai_verdict, confidence, disagreement_reason |
| `status_changed` | from, to, changed_by (+ `type: "specialty_tags"` ved tag-ændringer) |
| `verified` | from, to, changed_by |
| `author_linked` | authors_linked, new, duplicates, rejected |
| `quality_check` | passed, message |
| `impact_factor_updated` | impact_factor, journal_h_index |
| `citation_count_updated` | citation_count |

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
| `0046` | `authors.affiliations TEXT[]` kolonne |
| `0047` | `replace_article_specialty_tags` RPC |
| `0048` | `get_distinct_specialty_tags()` RPC |
| `0049` | `article_events`-tabel |
| `0050` | Circle 2 udvidelser |
| `0051` | `get_distinct_specialty_tags` funktion |
| `0052` | `articles.country`, `import_logs.circle`, `circle_3_sources`-tabel + seed |
| `0053` | Extend unlinked-articles RPCs til circle 3 |
| `0054` | `model_optimization_runs`-tabel |
| `0055` | `lab_decisions.model_version` kolonne |
| `0056` | `api_usage`-tabel |
| `0057` | `model_optimization_runs.refinement_iterations` JSONB kolonne |
| `0058` | `system_alerts`-tabel (title, message, type, active, expires_at) + RLS |
| `0059` | *(reserveret / ikke i brug)* |
| `0060` | `articles.citation_count`, `articles.citations_fetched_at` + index |
| `0061` | `articles.impact_factor`, `articles.impact_factor_fetched_at` |
| `0062` | `articles.journal_h_index INT` |
| `0063` | `articles.evidence_score NUMERIC(5,1)` — generated column (stored) |
| `0064` | `authors.author_score NUMERIC(5,1)` + `compute_author_scores()` funktion |
