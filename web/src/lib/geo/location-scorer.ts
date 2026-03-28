/**
 * Batch runner: parse author affiliations for articles that haven't been parsed yet.
 * Uses the deterministic affiliation parser — no AI, no external APIs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation, type ParsedAffiliation } from "./affiliation-parser";
import { getRegion } from "./continent-map";
import { buildLocationSummary } from "./article-location-summary";
import { buildGeoFields, type GeoFields } from "./affiliation-utils";
import { getCityCache, normalizeCityKey } from "./city-cache";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

type AuthorEntry = {
  affiliation?: string | null;
  affiliations?: string[] | null;
};

function getAffiliationString(author: AuthorEntry): string | null {
  if (typeof author.affiliation === "string" && author.affiliation.trim()) {
    return author.affiliation;
  }
  if (Array.isArray(author.affiliations) && author.affiliations.length > 0) {
    return author.affiliations[0] ?? null;
  }
  return null;
}

/** Collects all unique affiliation strings across every author. */
function getAllUniqueAffiliations(authors: AuthorEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const author of authors) {
    const affs = Array.isArray(author.affiliations)
      ? author.affiliations
      : typeof author.affiliation === "string" && author.affiliation.trim()
        ? [author.affiliation]
        : [];
    for (const aff of affs) {
      const t = aff.trim();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
  }
  return result;
}

export async function runLocationParsing(limit = 500): Promise<{
  parsed: number;
  highConfidence: number;
  lowConfidence: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;


  const { data: articles, error } = await db
    .from("articles")
    .select("id, authors")
    .is("location_parsed_at", null)
    .not("authors", "is", null)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  const rows = (articles ?? []) as { id: string; authors: unknown }[];

  // Filter to articles with non-empty authors array
  const eligible = rows.filter((r) => {
    if (!Array.isArray(r.authors)) return false;
    return r.authors.length > 0;
  });

  let parsed = 0;
  let highConfidence = 0;
  let lowConfidence = 0;
  let skipped = 0;

  // Build update payloads
  type UpdatePayload = {
    id: string;
    article_countries: string[];
    article_cities: string[];
    location_parsed_at: string;
  } & GeoFields;

  const updates: UpdatePayload[] = [];

  for (const article of eligible) {
    const authors = article.authors as AuthorEntry[];
    const firstAuthor = authors[0];
    const lastAuthor = authors.length > 1 ? authors[authors.length - 1] : null;

    let firstParsed = await parseAffiliation(getAffiliationString(firstAuthor));
    let lastParsed = lastAuthor
      ? await parseAffiliation(getAffiliationString(lastAuthor))
      : null;

    // Fallback: if first author gave no city/country, try all unique affiliations combined
    if (!firstParsed?.city && !firstParsed?.country) {
      const allAffs = getAllUniqueAffiliations(authors);
      if (allAffs.length > 1) {
        const fallback = await parseAffiliation(allAffs.join("\n"));
        if (fallback?.country) firstParsed = fallback;
      }
    }

    // City→country fallback: if parser found city but not country, try city-cache
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

    const now = new Date().toISOString();

    if (!firstParsed && !lastParsed) {
      // Both null — skip but still mark as parsed
      skipped++;
      updates.push({
        id: article.id,
        article_countries: [],
        article_cities: [],
        location_parsed_at: now,
        ...await buildGeoFields(null, null),
      });
      continue;
    }

    // Determine overall confidence for counter tracking
    let overallConfidence: "high" | "low";
    if (firstParsed && lastParsed) {
      overallConfidence =
        firstParsed.confidence === "low" || lastParsed.confidence === "low"
          ? "low"
          : "high";
    } else {
      // One is null, take the other's confidence
      const onlyParsed = (firstParsed ?? lastParsed) as ParsedAffiliation;
      overallConfidence = onlyParsed.confidence;
    }

    parsed++;
    if (overallConfidence === "high") highConfidence++;
    else lowConfidence++;

    const firstRegion = firstParsed?.country ? getRegion(firstParsed.country) ?? null : null;
    const lastRegion = lastParsed?.country ? getRegion(lastParsed.country) ?? null : null;
    const summary = buildLocationSummary(
      { region: firstRegion, country: firstParsed?.country ?? null, city: firstParsed?.city ?? null, institution: firstParsed?.institution ?? null },
      { region: lastRegion, country: lastParsed?.country ?? null, city: lastParsed?.city ?? null, institution: lastParsed?.institution ?? null },
    );

    const geoFields = await buildGeoFields(firstParsed, lastParsed);

    updates.push({
      id: article.id,
      ...summary,
      location_parsed_at: now,
      ...geoFields,
    });
  }

  // Also mark non-eligible rows (no authors array) as parsed so we don't retry
  const nonEligible = rows.filter((r) => !Array.isArray(r.authors) || r.authors.length === 0);
  for (const article of nonEligible) {
    skipped++;
    updates.push({
      id: article.id,
      article_countries: [],
      article_cities: [],
      location_parsed_at: new Date().toISOString(),
      ...await buildGeoFields(null, null),
    });
  }

  // Batch update in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => {
        const { id, ...fields } = u;
        return db.from("articles").update(fields).eq("id", id);
      })
    );
  }

  // Fire geo_updated events (fire-and-forget; previous=null — first parse)
  for (const u of updates) {
    const next: GeoSnapshot = {
      geo_city: u.geo_city,
      geo_country: u.geo_country,
      geo_state: u.geo_state,
      geo_region: u.geo_region,
      geo_continent: u.geo_continent,
      geo_institution: u.geo_institution,
      geo_department: u.geo_department,
    };
    logGeoUpdatedEvent(u.id, "parser", null, next);
  }

  return { parsed, highConfidence, lowConfidence, skipped };
}

/**
 * One-time re-parse of previously low-confidence articles.
 * Call after parser improvements to upgrade results. Not meant for loops.
 */
export async function reparseLowConfidence(cutoffDate: string, limit = 500): Promise<{
  parsed: number;
  highConfidence: number;
  lowConfidence: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: articles, error } = await db
    .from("articles")
    .select("id, authors")
    .eq("location_confidence", "low")
    .lt("location_parsed_at", cutoffDate)
    .not("authors", "is", null)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  const rows = (articles ?? []) as { id: string; authors: unknown }[];

  let parsed = 0;
  let highConfidence = 0;
  let lowConfidence = 0;

  const CHUNK_SIZE = 50;
  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const article of rows) {
    if (!Array.isArray(article.authors) || article.authors.length === 0) continue;

    const authors = article.authors as AuthorEntry[];
    const firstParsed = await parseAffiliation(getAffiliationString(authors[0]));
    const lastParsed = authors.length > 1
      ? await parseAffiliation(getAffiliationString(authors[authors.length - 1]))
      : null;

    let overallConfidence: "high" | "low" | null = null;
    if (firstParsed && lastParsed) {
      overallConfidence = firstParsed.confidence === "low" || lastParsed.confidence === "low" ? "low" : "high";
    } else if (firstParsed || lastParsed) {
      overallConfidence = ((firstParsed ?? lastParsed) as ParsedAffiliation).confidence;
    }

    parsed++;
    if (overallConfidence === "high") highConfidence++;
    else lowConfidence++;

    const firstRegionR = firstParsed?.country ? getRegion(firstParsed.country) ?? null : null;
    const lastRegionR = lastParsed?.country ? getRegion(lastParsed.country) ?? null : null;
    const summaryR = buildLocationSummary(
      { region: firstRegionR, country: firstParsed?.country ?? null, city: firstParsed?.city ?? null, institution: firstParsed?.institution ?? null },
      { region: lastRegionR, country: lastParsed?.country ?? null, city: lastParsed?.city ?? null, institution: lastParsed?.institution ?? null },
    );

    const geoFieldsR = await buildGeoFields(firstParsed, lastParsed);

    updates.push({
      id: article.id,
      fields: {
        ...summaryR,
        location_parsed_at: new Date().toISOString(),
        ...geoFieldsR,
      },
    });
  }

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => db.from("articles").update(u.fields).eq("id", u.id))
    );
  }

  return { parsed, highConfidence, lowConfidence };
}
