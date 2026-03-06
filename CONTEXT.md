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
| Datakilder | PubMed eUtils API, Circle 2/3 affiliations |

## Mappestruktur

```
pulsefeed/
├── web/
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── admin/            # Admin-sider
│   │   │   │   ├── system/       # Import, layers, author-linking, cost
│   │   │   │   ├── lab/          # AI-træning og scoring
│   │   │   │   └── articles/     # Artikel-administration
│   │   │   └── api/              # API-routes
│   │   │       ├── admin/        # Admin endpoints
│   │   │       │   ├── articles/[id]/    # PUT: edit specialty_tags, status, verified
│   │   │       │   ├── pubmed/           # Import-triggers (C1, C2, C3)
│   │   │       │   └── circle3-sources/  # GET/PUT circle_3_sources
│   │   │       ├── lab/          # Lab (scoring + sessions)
│   │   │       └── internal/     # Cron-jobs
│   │   ├── lib/
│   │   │   ├── supabase/         # DB-klient (admin.ts, client.ts, types.ts)
│   │   │   ├── pubmed/           # Import-pipeline
│   │   │   │   ├── importer.ts           # Circle 1 import
│   │   │   │   ├── importer-circle2.ts   # Circle 2 import (per-source loop)
│   │   │   │   ├── importer-circle3.ts   # Circle 3 import (danske neurokirurgi)
│   │   │   │   └── author-linker.ts      # JSONB → article_authors
│   │   │   ├── auth/             # require-admin.ts, specialties.ts
│   │   │   ├── affiliations.ts   # Affiliation parsing
│   │   │   └── ai/               # Anthropic tracked-client
│   │   └── components/
│   └── supabase/
│       └── migrations/           # 0001–0057 SQL-migrationer
```

## Database — vigtigste tabeller

| Tabel | Formål |
|-------|--------|
| `articles` | Artikler fra PubMed — `pubmed_id`, `title`, `abstract`, `authors` (JSONB), `circle`, `specialty_tags`, `status`, `verified`, `country`, `source_id` |
| `authors` | Forfatter-database — `display_name`, `city`, `country`, `specialty`, `affiliations` (TEXT[]) |
| `article_authors` | Many-to-many: artikler ↔ forfattere |
| `pubmed_filters` | Circle 1 søge-konfiguration (journal-lister, query_string, specialty) |
| `circle_2_sources` | Circle 2 affiliations (institution/region + max_results) — `articles.source_id` FK |
| `circle_3_sources` | Circle 3 affiliations (danske neurokirurgiske hospitaler) — `specialty`, `type`, `value`, `max_results`, `active` |
| `import_logs` | Log pr. import-kørsel — `filter_id`, `circle` (INT), `status`, `articles_imported` |
| `author_linking_logs` | Log pr. forfatter-linking-kørsel — `new_authors`, `duplicates`, `rejected` |
| `rejected_authors` | Forfattere der ikke kunne linkes |
| `lab_decisions` | Trænings-verdicts: `decision`, `ai_decision`, `ai_confidence`, `model_version`, `disagreement_reason` |
| `lab_sessions` | Samlet session pr. træningskørsel |
| `model_versions` | Aktive model-versioner pr. specialty+module — `version`, `active`, `prompt` |
| `model_optimization_runs` | AI-optimeringsanalyse — `improved_prompt`, `fp_count`, `fn_count`, `refinement_iterations` (JSONB) |
| `api_usage` | AI API-forbrug — `model_key`, `total_tokens`, `cost_usd`, `called_at` |
| `newsletter_feedback` | Ugentlig feedback på udvalgte artikler |
| `article_events` | Audit trail pr. artikel — `event_type`, `payload` (JSONB) |

### `articles.status`
- `approved` — Godkendt / publiceret
- `pending` — Afventer review
- `rejected` — Afvist

### `articles.circle`
- `1` — PubMed journal-søgning (`status=approved`, `verified=true`)
- `2` — Affiliation-søgning, kræver Lab-validering (`status=pending`, `verified=false`, `source_id` sat)
- `3` — Danske neurokirurgiske hospitaler (`status=pending`, `verified=false`, `country="Denmark"`)

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
author_linking_logs + rejected_authors opdateres
```

### Circle 1 (`importer.ts`)
- Kører pr. `pubmed_filter` (specialty + journal-liste)
- `status = "approved"`, `verified = true`

### Circle 2 (`importer-circle2.ts`)
- **Kører nu per-source** (én PubMed-kørsel pr. `circle_2_sources`-række) — ikke kombineret OR-query
- `source_id` sættes på hvert artikel til den matchende `circle_2_sources.id`
- Cross-source deduplicering via `seenPmids`-set
- `last_run_at` opdateres per source efter hver kørsel
- `status = "pending"`, `verified = false`

### Circle 3 (`importer-circle3.ts`)
- Bygger kombineret query: `("hospitalNavn"[AD] AND neurosurg*[AD]) OR ...` fra alle aktive `circle_3_sources`
- Aktive sources (seeded i migration 0052): Rigshospitalet, Aarhus University Hospital, Odense University Hospital, Aalborg University Hospital
- **Lokal affiliationscheck efter EFetch** — begge betingelser skal gælde på SAMME forfatters affiliation:
  - `/neurosurg/i` OG
  - Hospital-navn fra `circle_3_sources` (bygget dynamisk fra `sources`)
- Artikler der ikke passerer checket tæller som `skipped` og logges
- `status = "pending"`, `verified = false`, `country = "Denmark"`, `specialty_tags = ["neurosurgery"]`
- `source_id` kan **ikke** sættes (FK peger på `circle_2_sources`, ikke `circle_3_sources`)

### Author linking (`author-linker.ts`)
- `resolveAuthorId` returnerer `{ id, outcome }` — outcome: `"new" | "duplicate" | "rejected"`
- Forfattere uden `lastName` OG uden `orcid` → `rejected_authors`
- `computeMatchConfidence` threshold: **0.85**

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
- `scoreAll: boolean` — når `true`: scorer ALLE pending artikler med forældet `model_version`, ingen 50-grænse
- Bruges automatisk efter aktivering af ny model-version (kaldt fra SimulatorClient)

### Simulation (`simulate/SimulatorClient.tsx`)
- **To sektioner**: Fejlrettelse (uenigheder) + Regressionstest (enigheder fra aktiv model)
- **To sekventielle SSE-kald**: først disagreements, derefter agreement-sample
- Kombineret fremskridtslinje over alle artikler
- Regressionsadvarsel: `> 5` regressioner → rød advarsel; `≤ 5` → grøn
- Confidence-badge farve: grøn for `approved`, rød for `rejected` (ikke threshold-baseret)

### Rejection reasons med TAG_REMAP (fjerner specialty, tilføjer nyt tag via RPC):
| Reason | → tag |
|--------|-------|
| Neuroscience | neuroscience |
| Basic neuro research | basic_neuro_research |
| Oncology | oncology |
| Anesthesiology | anesthesiology |
| ENT | ent |

Øvrige: "Ikke klinisk relevant", "Other" (fritekst) → ingen remap, `status=rejected`.

### Score-batch rækkefølge
Artikler hentes sorteret `circle DESC NULLS LAST` — C3 → C2 → C1 → null.

## Admin-sider

| URL | Formål |
|-----|--------|
| `/admin/system` | System-oversigt |
| `/admin/system/import/[specialty]` | Import-statistik pr. specialty |
| `/admin/system/layers/[specialty]` | C1 filter + C2/C3 affiliation management + import-triggers |
| `/admin/system/author-linking` | Forfatter-linking dashboard |
| `/admin/system/cost` | AI API-forbrug (tokens + pris pr. call type, uge/måned/total) |
| `/admin/lab` | AI-træning, scoring, model-versioner |
| `/admin/lab/specialty-tag/dashboard` | KPI-kort pr. aktiv model-version, kalibreringstabel |
| `/admin/lab/specialty-tag/evaluation` | Uenigheder filtreret pr. model-version (VersionSelector) |
| `/admin/lab/specialty-tag/optimize` | Kør analyse → se FP/FN-mønstre → forfin prompt |
| `/admin/lab/specialty-tag/simulate?run_id=` | Simuler forbedret prompt vs. uenigheder + regressionstest |
| `/admin/articles` | Artikel-liste med filter på specialty/status |
| `/admin/articles/[id]` | Artikel-stamkort: historik + redigerbare tags/status/verified |
| `/admin/authors/[id]` | Forfatter-profil med affiliations |

## Vigtige konventioner

- **Admin-klient**: Brug altid `createAdminClient()` fra `@/lib/supabase/admin` i server-kode
- **Auth-guard**: `await requireAdmin()` øverst i alle admin API-routes
- **Fire-and-forget**: Import-routes returnerer `{ ok: true }` og kører import i baggrunden (`after()`)
- **TypeScript — manglende Supabase-typer**:
  - For tabeller der ikke er i `types.ts`: `const db = admin as any`
  - For RPC-kald der ikke er i `types.ts`: `(admin as any).rpc("navn", args)` — **ikke** `as never` (det giver `args: undefined`-fejl)
- **replace_article_specialty_tags RPC**: Bruges når specialty_tags skal erstattes rent (bypasser merge-trigger). Kræver alle 4 args: `p_article_id`, `p_tags`, `p_verified`, `p_status`.
- **Specialties**: Brug `SPECIALTY_SLUGS` fra `@/lib/auth/specialties` — aldrig hardcode specialty-navne
- **Migrations**: Nummereres `0001`, `0002` osv. — kør manuelt i Supabase SQL Editor efter push

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
