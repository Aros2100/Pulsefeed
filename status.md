# PulseFeed — Status (15. marts 2026, session 3)

## Opgave: OpenAlex-integration i import-pipeline

## Færdigt ✅
- `src/lib/openalex/client.ts` — fetchWorkByDoi + fetchWorksByDois (batch 50, pLimit 5)
- `src/lib/openalex/match-authors.ts` — PubMed↔OpenAlex matching (97% match-rate testet)
- `src/lib/pubmed/author-linker.ts` — batch DOI-opslag per linking-batch, sender oaWork videre
- `src/lib/pubmed/importer.ts` — ny resolveAuthorFromOpenAlex() (OA-id→ORCID→name+country→fallback)
- Migration 0060: ror_id, institution_type, geo_source på authors; openalex_work_id, fwci på articles
- RPC fetch_unlinked_articles opdateret med doi-kolonne
- Test: 5/5 artikler fundet, 34/35 forfattere matchet (97%)
- Dry-run backfill: 8.449 artikler, 61k authors+OA-id, 59k+ROR, 26k nye ORCID

## Kører nu 🔄
- `npx tsx src/scripts/backfill-openalex.ts` (skarpt, i terminal)
- Idempotent: filtrerer på openalex_work_id IS NULL, kan genstartes ved timeout

## Næste skridt
- Verificér backfill-resultater (counts på openalex_id, ror_id, orcid)
- Fix "Van Gompel"-edge case i match-authors.ts (nobility-prefix stripping)
- Opdater BRIDGE.md med session-resultater
- Overvej: geo_source-baseret visning i geo-explorer
