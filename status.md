# PulseFeed — Status (15. marts 2026, session 4)

## Opgave: Geo-berigelse af forfattere + valideringsflow

## Færdigt ✅

### Admin UI
- `/admin/authors/[id]` — omskrevet til client-component med 3 tabs (Profil / OpenAlex / Log)
  - Alle geo-felter (department, hospital, city, state, country) vises direkte fra DB
  - OpenAlex + ROR som klikkbare links; timestamps i Log-tab
- `/admin/articles/[id]` + `ArticleStamkort` + `CollapseAuthors` — geo-data (department, hospital, city, state, country, verified_by) vises per forfatter med badge (OpenAlex / Verificeret / Uverificeret)
- `AuthorGeoClient` (Lab → Author Geo Validator):
  - Feltrækkefølge: department → hospital → city → state → country
  - `verified_by: "human"` sendes med ved approve/correct
  - GET-handler: henter nu `verified_by = "uverificeret"` direkte, sorted by article_count DESC
  - POST-handler: skriver `verified_by` til authors-tabellen

### Backfill-scripts (oprettet)
- `backfill-openalex.ts` — beriget med openalex_enriched_at / orcid_enriched_at / ror_enriched_at timestamps
- `backfill-parser-authors.ts` — opgraderer parser-forfattere med ORCID til OpenAlex (2.563 kørt som dry-run)
- `backfill-openalex-institutions.ts` — beriger forfattere med openalex_id men manglende hospital/country; laver ROR-opslag hvis ror_id sættes
- `backfill-ror-cities.ts` — beriger forfattere med ror_id IS NOT NULL AND city IS NULL via ROR geonames_details
  - Dry-run: 2.563 authors, +city=2.563, +state=2.463, +country=1.204
- `backfill-fix-department-in-hospital.ts` — retter forfattere hvor hospital-feltet indeholder afdelingsnavn
  - Henter korrekt institutionsnavn fra ROR `names[].types=ror_display`
  - Rykker gammel hospital-værdi til department (hvis department IS NULL)
  - Dry-run: 1.753 authors, hospital fixed=1.141, department moved=702

### Import-pipeline (`importer.ts`)
- `fetchRorGeo()` — ny helper: slår ROR op og returnerer city/state/country fra geonames_details
- `splitInstitutionAndDepartment()` + `isDepartment()` — splitter OpenAlex institution.displayName korrekt
- Alle 3 cases (ORCID match / name match / fallback) bruger nu split + ROR geo-opslag når ror_id sættes

### Typer (`types.ts`)
- `articles`: tilføjet `fwci`, `openalex_work_id`
- `authors`: tilføjet `author_score`, `ror_id`, `geo_source`, `institution_type`, `openalex_enriched_at`, `orcid_enriched_at`, `ror_enriched_at`

## Afventer kørsel 🔄
Følgende scripts er klar til live-kørsel (i denne rækkefølge):
1. `backfill-ror-cities.ts` — city/state/country fra ROR (2.563 authors)
2. `backfill-fix-department-in-hospital.ts` — ret department-i-hospital fejl (1.141 authors)
3. `backfill-openalex-institutions.ts` — hospital/country fra OpenAlex for authors med openalex_id
4. `backfill-parser-authors.ts` — opgrader parser+ORCID authors til OpenAlex

## Næste skridt
- Kør backfill-scripts live (se rækkefølge ovenfor)
- Verificér geo-kvalitet: counts på verified_by fordeling, city/hospital coverage
- Overvej: `backfill-openalex-institutions.ts` bruger `or("hospital.is.null,country.is.null")` — kan udvides til også at ramme authors med department-i-hospital (efter fix)
- Lab → Author Geo Validator: test flow med `verified_by = "uverificeret"` queue
- Migration: `verified_by` kolonnen — tjek om default-værdi er sat korrekt i DB (bør være `"uverificeret"`)
