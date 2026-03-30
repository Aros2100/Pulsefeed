import { createAdminClient } from './src/lib/supabase/admin';
import { decodeHtmlEntities, type Author } from './src/lib/artikel-import/fetcher';
import { linkAuthorsToArticle } from './src/lib/forfatter-import/find-or-create';
import { getRegion, getContinent } from './src/lib/geo/country-map';
import { lookupState } from './src/lib/geo/state-map';
import { getCityCache, normalizeCityKey } from './src/lib/geo/city-cache';

const KNOWN_IDS = [
  '53ee462a-4e52-40ff-86d4-ac4e0cc7a189',
];

(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: known } = await admin
    .from('articles')
    .select('id, pubmed_id, authors')
    .in('id', KNOWN_IDS);

  for (const article of known ?? []) {
    console.log(`\n=== Article ${article.id} (PMID ${article.pubmed_id})`);

    const rawAuthors = (article.authors ?? []) as Record<string, unknown>[];
    const authors: Author[] = rawAuthors.map((a) => ({
      lastName:     decodeHtmlEntities(String(a.lastName ?? '')),
      foreName:     decodeHtmlEntities(String(a.foreName ?? '')),
      affiliations: Array.isArray(a.affiliations)
        ? (a.affiliations as string[])
        : a.affiliation != null ? [String(a.affiliation)] : [],
      orcid: a.orcid != null ? String(a.orcid) : null,
    }));

    const idx = authors.findIndex(a => a.lastName === 'Roohollahi');
    console.log(`[GEO-DEBUG Roohollahi] position: ${idx + 1} of ${authors.length}`);
    console.log(`[GEO-DEBUG Roohollahi] affiliations:`, authors[idx]?.affiliations);
    console.log(`\nFirst author: ${authors[0]?.foreName} ${authors[0]?.lastName}`);
    console.log(`First author affiliations:`, authors[0]?.affiliations);
    console.log(`Last author: ${authors[authors.length-1]?.foreName} ${authors[authors.length-1]?.lastName}`);
    console.log(`Last author affiliations:`, authors[authors.length-1]?.affiliations);

    const result = await linkAuthorsToArticle(admin, article.id, authors, null);

    console.log(`\n[GEO-DEBUG Roohollahi] firstAuthorGeo after linkAuthorsToArticle:`, JSON.stringify(result.firstAuthorGeo));
    console.log(`[GEO-DEBUG Roohollahi] lastAuthorGeo after linkAuthorsToArticle:`, JSON.stringify(result.lastAuthorGeo));

    // Simulate what author-linker would write (same logic as author-linker.ts)
    const first = result.firstAuthorGeo;
    let effectiveCountry = first?.country ?? null;
    if (!effectiveCountry && first?.city) {
      const cityCache = await getCityCache();
      effectiveCountry = cityCache.countryMap.get(normalizeCityKey(first.city)) ?? null;
    }
    const firstContinent = effectiveCountry ? getContinent(effectiveCountry) : null;
    const firstRegion    = effectiveCountry ? getRegion(effectiveCountry)    : null;
    const firstState     = first?.state ?? (first?.city && effectiveCountry ? lookupState(first.city, effectiveCountry) : null);

    const geoUpdate = {
      geo_department:      first?.department ?? null,
      geo_continent:       firstContinent,
      geo_region:          firstRegion,
      geo_country:         effectiveCountry,
      geo_state:           firstState,
      geo_city:            first?.city ?? null,
      geo_institution:     first?.institution ?? null,
      location_confidence: first?.confidence ?? result.lastAuthorGeo?.confidence ?? null,
    };

    console.log(`\n[GEO-DEBUG Roohollahi] geoUpdate that would be written to articles:`, JSON.stringify(geoUpdate, null, 2));
    console.log(`Link result: new=${result.new} dup=${result.duplicates} rejected=${result.rejected}`);
  }
})();
