# PulseFeed — Roadmap (opdateret 15. marts 2026)

## Aktiv nu
- [ ] Backfill-openalex kører — verificér resultater efter afslutning
- [ ] Van Gompel-fix: nobility-prefix stripping i match-authors.ts

## OpenAlex follow-up
- [ ] Backfill city: OA institutions har geo-koordinater → reverse geocoding eller institution-endpoint
- [ ] Geo-explorer: brug ROR-normaliserede institutioner i visning
- [ ] Geo-explorer: vis geo_source (openalex/parser/manual)
- [ ] Hospital-normalisering: bekræft at ROR løser det → luk opgaven

## Datakvalitet (parser-relikter)
- [ ] 410 city uden country — fallback via city-country-map.ts
- [ ] 4 institution-som-city
- [ ] 1.492 department som hospital (mange nu løst via OA backfill)
- [ ] 991 med affiliations men ingen geo
- [ ] ~500 duplikat-par uden ORCID/same hospital — admin merge-side
- [ ] City-country-map.ts fallback ikke bygget
- [ ] City-set aliasser (alternateNames fra GeoNames)

## AI-klassificering
- [ ] Classification v2: Type + Evidens + Klinisk handlingsbar (afventer neurokirurg)
- [ ] v4 specialty scoring prompt (fix inverteret confidence-skala)
- [ ] PICO validation rejection reasons

## Platform
- [ ] State-policy integration (5 af 9 punkter udestår)
- [ ] Admin merge-side for ~500 human-review forfatter-par
- [ ] Follow/subscribe-system: brugere tracker forskning fra specifikke lokationer

## Langsigtet
- [ ] Automatiseret kuration: high-confidence AI-beslutninger bypass human validation
- [ ] OpenAlex som primær kilde ved skalering til 1M+ artikler
