# PulseFeed — Claude Context

## Hvad er PulseFeed?

PulseFeed er et medicinsk nyhedsbrev-system der automatisk importerer videnskabelige artikler fra PubMed, beriger dem med AI, og sender ugentlige nyhedsbreve til læger opdelt på specialer.

## Tech stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | Next.js 16.1, React 19, TypeScript 5, Tailwind CSS 4 |
| Backend | Next.js API routes (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + custom role-system (admin/editor/viewer) |
| AI | Anthropic Claude (Haiku til scoring, Sonnet til berigelse) |
| Email | Resend |
| Datakilder | PubMed eUtils API, Circle 2 affiliations |

## Mappestruktur

```
pulsefeed/
├── web/
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── admin/            # Admin-sider
│   │   │   │   ├── system/       # Import, layers, author-linking
│   │   │   │   ├── lab/          # AI-træning og scoring
│   │   │   │   └── articles/     # Artikel-administration
│   │   │   └── api/              # API-routes
│   │   │       ├── admin/        # Admin endpoints
│   │   │       └── internal/     # Cron-jobs
│   │   ├── lib/
│   │   │   ├── supabase/         # DB-klient (admin.ts, client.ts, types.ts)
│   │   │   ├── pubmed/           # Import-pipeline
│   │   │   │   ├── importer.ts           # Circle 1 import
│   │   │   │   ├── importer-circle2.ts   # Circle 2 import
│   │   │   │   └── author-linker.ts      # JSONB → article_authors
│   │   │   ├── auth/             # require-admin.ts, specialties.ts
│   │   │   ├── affiliations.ts   # Affiliation parsing
│   │   │   └── ai/               # Anthropic tracked-client
│   │   └── components/
│   └── supabase/
│       └── migrations/           # 0001–0045 SQL-migrationer
```

## Database — vigtigste tabeller

| Tabel | Formål |
|-------|--------|
| `articles` | Artikler fra PubMed — `pubmed_id`, `title`, `abstract`, `authors` (JSONB), `circle`, `specialty_tags`, `status`, `verified` |
| `authors` | Forfatter-database — `display_name`, `city`, `country`, `specialty` |
| `article_authors` | Many-to-many: artikler ↔ forfattere |
| `pubmed_filters` | Circle 1 søge-konfiguration (journal-lister, query_string, specialty) |
| `circle_2_sources` | Circle 2 affiliations (institution/region + max_results) |
| `import_logs` | Log pr. import-kørsel — `filter_id`, `status`, `articles_imported`, `author_slots_imported` |
| `author_linking_logs` | Log pr. forfatter-linking-kørsel — `new_authors`, `duplicates`, `rejected` |
| `rejected_authors` | Forfattere der ikke kunne linkes (ingen efternavn + ingen ORCID) |
| `lab_decisions` | Trænings-verdicts: `editor_verdict` vs `ai_verdict`, `model_version` |
| `newsletter_feedback` | Ugentlig feedback på udvalgte artikler |

### `articles.status`
- `approved` — Godkendt / publiceret
- `pending` — Afventer review
- `rejected` — Afvist

### `articles.circle`
- `1` — PubMed journal-søgning (automatisk godkendt, `verified=true`)
- `2` — Affiliation-søgning (kræver validering, `verified=false`)
- `3` — Manuelt importeret

## Import-pipeline

```
PubMed eUtils (ESearch → EFetch)
    ↓
Upsert i articles-tabellen
    ↓
import_logs oprettes pr. filter (ikke én global log)
    ↓
author-linker: JSONB authors → article_authors (via resolveAuthorId)
    ↓
author_linking_logs + rejected_authors opdateres
```

### Circle 1 (`importer.ts`)
- Kører pr. `pubmed_filter` (specialty + journal-liste)
- Én `import_logs`-række pr. filter pr. kørsel
- `status = "approved"`, `verified = true`

### Circle 2 (`importer-circle2.ts`)
- Kører pr. specialty, bruger affiliation-terms fra `circle_2_sources`
- `status = "pending"`, `verified = false`

### Author linking (`author-linker.ts`)
- `resolveAuthorId` returnerer `{ id, outcome }` — outcome: `"new" | "duplicate" | "rejected"`
- Forfattere uden `lastName` OG uden `orcid` → `rejected_authors`-tabellen
- `computeMatchConfidence` threshold: **0.85**
  - Fuldt fornavn + efternavn + affiliation: 0.90
  - Fuldt fornavn + efternavn: 0.80
  - Initial + efternavn + affiliation: 0.80
  - Initial + efternavn: 0.60

## Vigtige konventioner

- **Admin-klient**: Brug altid `createAdminClient()` fra `@/lib/supabase/admin` i server-kode
- **Auth-guard**: `await requireAdmin()` øverst i alle admin API-routes
- **Fire-and-forget**: Import-routes returnerer `{ ok: true }` og kører import baggrunden
- **TypeScript**: Brug `as never` for Supabase-tabeller der ikke er i de auto-genererede types endnu
- **Specialties**: Brug `SPECIALTY_SLUGS` fra `@/lib/auth/specialties` — aldrig hardcode specialty-navne
- **Migrations**: Nummereres `0001`, `0002` osv. — kør manuelt i Supabase SQL Editor efter push

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

## Admin-sider

| URL | Formål |
|-----|--------|
| `/admin/system` | System-oversigt |
| `/admin/system/import/[specialty]` | Import-statistik pr. specialty |
| `/admin/system/layers/[specialty]` | Circle 1 filter + Circle 2 affiliation management + import-trigger |
| `/admin/system/author-linking` | Forfatter-linking dashboard (kø, akkumulering, afviste) |
| `/admin/lab` | AI-træning og model-versioner |
| `/admin/articles` | Artikel-liste med log-links |
| `/admin/articles/[id]` | Artikel-historik (import → berigelse → lab-beslutninger) |

## Seneste migrationer (mar 2026)

| Fil | Indhold |
|-----|---------|
| `0039` | `author_linking_logs.import_log_id` FK |
| `0040` | Circle 2 artikler inkluderet i unlinked RPCs |
| `0041` | `count_unlinked_author_slots()` RPC |
| `0042` | `unlinked_author_slots_for_import_logs(p_ids)` RPC |
| `0043` | `author_linking_logs`: `new_authors`, `duplicates`, `rejected` kolonner |
| `0044` | `rejected_authors`-tabel |
| `0045` | `import_logs.author_slots_imported` kolonne |
