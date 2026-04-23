# CLAUDE.md

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Anthropic Claude SDK (Haiku for scoring, Sonnet for analysis) · Resend (email) · Vercel (deploy + cron) · PubMed eUtils · Europe PMC · OpenAlex · GeoNames

## Commands

```bash
cd web && npm run dev      # dev server :3000
cd web && npm run build    # production build
cd web && npm run lint      # eslint
```

No test framework configured. Validation via ad-hoc scripts in `web/scripts/`.

## Project Structure

```
pulsefeed/
├── web/src/
│   ├── app/                    # Pages + API routes (App Router)
│   │   ├── api/                # ~105 route handlers
│   │   │   ├── admin/          # 68 admin endpoints (requireAdmin guard)
│   │   │   ├── internal/       # Cron: daily PubMed import 02:00 UTC
│   │   │   ├── lab/            # Scoring sessions + model versions
│   │   │   └── ...             # auth, articles, authors, geo, profile, etc.
│   │   ├── admin/
│   │   │   ├── (with-header)/  # Route group: shared Header + AlertBanner
│   │   │   │   └── lab/        # 4 modules: specialty-tag, classification, condensation, author-geo
│   │   │   └── system/         # Import, cost, tagging, author-linking, alerts, layers
│   │   └── ...                 # Public pages: articles, authors, geo, search, saved, etc.
│   ├── lib/                    # Business logic
│   │   ├── supabase/           # DB clients: admin.ts (service role), server.ts, client.ts, types.ts (generated)
│   │   ├── pubmed/             # 3-circle import pipeline (importer.ts, circle2, circle3, author-linker)
│   │   ├── geo/                # Deterministic parser + lookup tables (city-set 989KB, city-country-map 1.6MB)
│   │   ├── ai/                 # tracked-client.ts — Claude wrapper with cost logging to api_usage
│   │   ├── lab/                # scorer.ts, classification-options.ts
│   │   ├── openalex/           # Author disambiguation + impact factors
│   │   ├── tagging/            # MeSH auto-tagger + publication-type mapper
│   │   └── auth/               # require-admin.ts, specialties.ts, schemas.ts (Zod)
│   └── components/             # React components (Header, ArticleFilterPanel, KPIOverview, etc.)
├── supabase/migrations/        # 60+ numbered .sql migrations
└── vercel.json                 # Cron config
```

## Database (key tables)

| Table | Purpose | Key relations |
|-------|---------|---------------|
| `users` | Subscribers + admins | → authors (author_id), self-ref (referred_by_id) |
| `authors` | Author profiles with geo | ← article_authors, ← author_follows |
| `articles` | PubMed articles with AI enrichment | circle (1/2/3), status (pending/approved/rejected) |
| `article_authors` | M:N link | → articles, → authors. Triggers sync article_count |
| `pubmed_filters` | Search queries per specialty | circle 1 or 2 |
| `circle_2_sources` / `circle_3_sources` | Import sources | type: mesh/text/author/institution/etc. |
| `import_logs` | Import job tracking | → pubmed_filters |
| `author_linking_logs` | Linking job tracking | → import_logs |
| `rejected_authors` | Failed author links | → articles, → author_linking_logs |
| `lab_sessions` | Training batch metadata | specialty + module |
| `lab_decisions` | Human verdicts on AI output | → lab_sessions, → articles, → authors |
| `model_versions` | Active prompts per specialty/module | unique (specialty, module, active) |
| `tagging_rules` | MeSH auto-approve rules | Built from lab_decisions via RPC |
| `tagging_rule_combos` | MeSH pair rules | term_1 < term_2 constraint |
| `api_usage` | AI cost tracking | model_key, tokens, cost_usd |
| `geo_cities` | GeoNames import | geonameid PK, population-ranked |
| `geo_city_state_cache` | Nominatim lookup cache | (city, country) PK |
| `saved_articles` | Bookmarks | → users, → articles, → projects |
| `reading_history` | View log | → users, → articles |
| `notifications` | User notifications | → users |
| `system_alerts` | Banner alerts | type: info/warning/error |

50+ RPC functions for KPI aggregation, filtering, and training data queries.

## Code Conventions

- **Imports**: `@/*` alias → `./src/*`. Absolute imports everywhere.
- **Styling**: Inline styles dominant. No component library.
- **Components**: Server components default; `"use client"` only when needed. PascalCase filenames.
- **API routes**: `requireAdmin()` guard → Zod validation → Supabase query → `NextResponse.json({ ok, error?, data? })`
- **DB access**: `createAdminClient()` bypasses RLS; `createClient()` respects it. Never mix.
- **AI calls**: Always via `tracked-client.ts` which logs tokens/cost to `api_usage`.
- **Naming**: camelCase functions, PascalCase components, snake_case DB columns, kebab-case files.
- **Error pattern**: `{ ok: false, error: string }` with appropriate HTTP status.
- **Fire-and-forget**: Long tasks use `after()` hook or `void runTask()`.
- **RLS**: Every new `public` table MUST have RLS enabled in the same migration. Never create a table without it. Choose the policy based on access pattern:

  ```sql
  -- ALWAYS required:
  ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

  -- A) Server-side only (import pipelines, cron jobs, webhooks via createAdminClient):
  --    No policy needed — service_role bypasses RLS automatically.
  --    DO revoke write access from anon/authenticated if it was granted:
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.my_table FROM anon, authenticated;

  -- B) Public reference data (UI dropdowns, lookup tables):
  CREATE POLICY "my_table_public_select"
    ON public.my_table FOR SELECT TO anon, authenticated USING (true);
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.my_table FROM anon, authenticated;

  -- C) Requires login (user-facing data, newsletters, saved items):
  CREATE POLICY "my_table_authenticated_select"
    ON public.my_table FOR SELECT TO authenticated USING (true);
  REVOKE ALL ON public.my_table FROM anon;

  -- D) User owns their own rows:
  CREATE POLICY "my_table_own_rows"
    ON public.my_table FOR SELECT TO authenticated USING (user_id = auth.uid());
  ```

  After applying, verify: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'my_table';`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY, RESEND_API_KEY, PUBMED_API_KEY, OPENALEX_API_KEY, OPENALEX_EMAIL
NEWSLETTER_FROM_EMAIL, UNSUBSCRIBE_SECRET, CRON_SECRET, NEXT_PUBLIC_SITE_URL
```

## Architecture Notes

- **3-circle import**: C1 = trusted journals (auto-approve), C2 = affiliation-based (needs validation), C3 = Danish hospitals
- **Geo pipeline**: Deterministic parser first (18 modules) → AI fallback (Claude Haiku) for low confidence
- **Lab system**: 4 independent modules with scoring sessions, human verdicts, disagreement tracking
- **Auth**: Supabase Auth with `app_metadata.role` for admin check. RLS enforced on all user-facing tables.
