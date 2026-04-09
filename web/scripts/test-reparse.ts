import { createAdminClient } from './src/lib/supabase/admin';
import { parseAffiliation, type ParsedAffiliation } from './src/lib/geo/affiliation-parser';
import { getRegion } from './src/lib/geo/continent-map';
import { buildLocationSummary } from './src/lib/geo/article-location-summary';
import { buildGeoFields } from './src/lib/geo/affiliation-utils';
import { getCityCache, normalizeCityKey } from './src/lib/geo/city-cache';

type AuthorEntry = {
  affiliation?: string | null;
  affiliations?: string[] | null;
};

function getAffiliationString(author: AuthorEntry): string | null {
  if (typeof author.affiliation === 'string' && author.affiliation.trim()) return author.affiliation;
  if (Array.isArray(author.affiliations) && author.affiliations.length > 0) return author.affiliations[0] ?? null;
  return null;
}

function getAllUniqueAffiliations(authors: AuthorEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const author of authors) {
    const affs = Array.isArray(author.affiliations)
      ? author.affiliations
      : typeof author.affiliation === 'string' && author.affiliation.trim()
        ? [author.affiliation]
        : [];
    for (const aff of affs) {
      const t = aff.trim();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
  }
  return result;
}

const ARTICLE_IDS = [
  '9ccd96ae-2610-4015-b4d2-1ac04b7f710c',
  'deafcba5-e5d5-4fa1-ad9b-e0745bf087b5',
  '0dd361d3-c0a3-443f-b432-3b846d2af4a3',
];

(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: articles, error } = await db
    .from('articles')
    .select('id, authors')
    .in('id', ARTICLE_IDS);

  if (error) { console.error('Fetch error:', error.message); process.exit(1); }

  for (const article of articles ?? []) {
    console.log('\n=== Article:', article.id);

    if (!Array.isArray(article.authors) || article.authors.length === 0) {
      console.log('No authors — skipping');
      continue;
    }

    const authors = article.authors as AuthorEntry[];
    const firstAuthor = authors[0];
    const lastAuthor = authors.length > 1 ? authors[authors.length - 1] : null;

    let firstParsed = await parseAffiliation(getAffiliationString(firstAuthor));
    let lastParsed = lastAuthor ? await parseAffiliation(getAffiliationString(lastAuthor)) : null;

    // Fallback: if first author gave no city/country, try all unique affiliations
    if (!firstParsed?.city && !firstParsed?.country) {
      const allAffs = getAllUniqueAffiliations(authors);
      if (allAffs.length > 1) {
        const fallback = await parseAffiliation(allAffs.join('\n'));
        if (fallback?.country) firstParsed = fallback;
      }
    }

    // City→country fallback via city-cache
    const needsCacheLookup = (firstParsed?.city && !firstParsed?.country) || (lastParsed?.city && !lastParsed?.country);
    if (needsCacheLookup) {
      const cityCache = await getCityCache();
      if (firstParsed?.city && !firstParsed?.country) {
        const c = cityCache.countryMap.get(normalizeCityKey(firstParsed.city));
        if (c) firstParsed = { ...firstParsed, country: c };
      }
      if (lastParsed?.city && !lastParsed?.country) {
        const c = cityCache.countryMap.get(normalizeCityKey(lastParsed.city));
        if (c) lastParsed = { ...lastParsed, country: c };
      }
    }

    console.log('firstParsed:', JSON.stringify(firstParsed));
    console.log('lastParsed: ', JSON.stringify(lastParsed));

    const firstRegion = firstParsed?.country ? getRegion(firstParsed.country) ?? null : null;
    const lastRegion  = lastParsed?.country  ? getRegion(lastParsed.country)  ?? null : null;
    const summary = buildLocationSummary(
      { region: firstRegion, country: firstParsed?.country ?? null, city: firstParsed?.city ?? null, institution: firstParsed?.institution ?? null },
      { region: lastRegion,  country: lastParsed?.country  ?? null, city: lastParsed?.city  ?? null, institution: lastParsed?.institution  ?? null },
    );
    const geoFields = await buildGeoFields(firstParsed, lastParsed);

    const fields = {
      ...summary,
      location_parsed_at: new Date().toISOString(),
      ...geoFields,
    };

    console.log('fields to write:', JSON.stringify(fields, null, 2));

    const { error: updateErr } = await db.from('articles').update(fields).eq('id', article.id);
    if (updateErr) console.error('Update error:', updateErr.message);
    else console.log('✓ Updated');
  }
})();
