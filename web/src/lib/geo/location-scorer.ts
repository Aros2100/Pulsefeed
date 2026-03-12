/**
 * Batch runner: parse author affiliations for articles that haven't been parsed yet.
 * Uses the deterministic affiliation parser — no AI, no external APIs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation, type ParsedAffiliation } from "./affiliation-parser";
import { getRegion, getContinent } from "./continent-map";
import { buildLocationSummary } from "./article-location-summary";
import { lookupState } from "./state-map";

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

export async function runLocationParsing(limit = 500): Promise<{
  parsed: number;
  highConfidence: number;
  lowConfidence: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  console.log("[geo/run-parse] Starting parse, targeting unparsed articles");

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
    first_author_department: string | null;
    first_author_institution: string | null;
    first_author_city: string | null;
    first_author_country: string | null;
    first_author_region: string | null;
    last_author_department: string | null;
    last_author_institution: string | null;
    last_author_city: string | null;
    last_author_country: string | null;
    last_author_region: string | null;
    article_regions: string[];
    article_countries: string[];
    article_cities: string[];
    article_institutions: string[];
    location_parsed_at: string;
    location_confidence: "high" | "low" | null;
    geo_continent: string | null;
    geo_region: string | null;
    geo_country: string | null;
    geo_state: string | null;
    geo_city: string | null;
    geo_institution: string | null;
    geo_country_certain: boolean | null;
    geo_state_certain: boolean | null;
    geo_city_certain: boolean | null;
    geo_institution_certain: boolean | null;
  };

  const updates: UpdatePayload[] = [];

  for (const article of eligible) {
    const authors = article.authors as AuthorEntry[];
    const firstAuthor = authors[0];
    const lastAuthor = authors.length > 1 ? authors[authors.length - 1] : null;

    const firstParsed = parseAffiliation(getAffiliationString(firstAuthor));
    const lastParsed = lastAuthor
      ? parseAffiliation(getAffiliationString(lastAuthor))
      : null;

    const now = new Date().toISOString();

    if (!firstParsed && !lastParsed) {
      // Both null — skip but still mark as parsed
      skipped++;
      updates.push({
        id: article.id,
        first_author_department: null,
        first_author_institution: null,
        first_author_city: null,
        first_author_country: null,
        first_author_region: null,
        last_author_department: null,
        last_author_institution: null,
        last_author_city: null,
        last_author_country: null,
        last_author_region: null,
        article_regions: [],
        article_countries: [],
        article_cities: [],
        article_institutions: [],
        location_parsed_at: now,
        location_confidence: null,
        geo_continent: null,
        geo_region: null,
        geo_country: null,
        geo_state: null,
        geo_city: null,
        geo_institution: null,
        geo_country_certain: null,
        geo_state_certain: null,
        geo_city_certain: null,
        geo_institution_certain: null,
      });
      continue;
    }

    // Determine overall confidence
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

    // geo_* fields: always derived from first author
    const geoCountry = firstParsed?.country ?? null;
    const geoCity = firstParsed?.city ?? null;
    const geoInstitution = firstParsed?.institution ?? null;
    const geoRegion = firstRegion;
    const geoContinent = firstRegion ? getContinent(firstRegion) : null;
    const geoState = geoCity && geoCountry ? lookupState(geoCity, geoCountry) : null;

    // Certainty: true when last author is null (single author) or matches first author
    const hasLastAuthor = lastParsed !== null;
    const geoCountryCertain = !hasLastAuthor || lastParsed.country == null || lastParsed.country === firstParsed?.country;
    const geoStateCertain = geoCountryCertain;
    const geoCityCertain = geoCountryCertain && (!hasLastAuthor || lastParsed.city == null || lastParsed.city === firstParsed?.city);
    const geoInstitutionCertain = geoCityCertain && (!hasLastAuthor || lastParsed.institution == null || lastParsed.institution === firstParsed?.institution);

    updates.push({
      id: article.id,
      first_author_department: firstParsed?.department ?? null,
      first_author_institution: firstParsed?.institution ?? null,
      first_author_city: firstParsed?.city ?? null,
      first_author_country: firstParsed?.country ?? null,
      first_author_region: firstRegion,
      last_author_department: lastParsed?.department ?? null,
      last_author_institution: lastParsed?.institution ?? null,
      last_author_city: lastParsed?.city ?? null,
      last_author_country: lastParsed?.country ?? null,
      last_author_region: lastRegion,
      ...summary,
      location_parsed_at: now,
      location_confidence: overallConfidence,
      geo_continent: geoContinent,
      geo_region: geoRegion,
      geo_country: geoCountry,
      geo_state: geoState,
      geo_city: geoCity,
      geo_institution: geoInstitution,
      geo_country_certain: geoCountryCertain,
      geo_state_certain: geoStateCertain,
      geo_city_certain: geoCityCertain,
      geo_institution_certain: geoInstitutionCertain,
    });
  }

  // Also mark non-eligible rows (no authors array) as parsed so we don't retry
  const nonEligible = rows.filter((r) => !Array.isArray(r.authors) || r.authors.length === 0);
  for (const article of nonEligible) {
    skipped++;
    updates.push({
      id: article.id,
      first_author_department: null,
      first_author_institution: null,
      first_author_city: null,
      first_author_country: null,
      first_author_region: null,
      last_author_department: null,
      last_author_institution: null,
      last_author_city: null,
      last_author_country: null,
      last_author_region: null,
      article_regions: [],
      article_countries: [],
      article_cities: [],
      article_institutions: [],
      location_parsed_at: new Date().toISOString(),
      location_confidence: null,
      geo_continent: null,
      geo_region: null,
      geo_country: null,
      geo_state: null,
      geo_city: null,
      geo_institution: null,
      geo_country_certain: null,
      geo_state_certain: null,
      geo_city_certain: null,
      geo_institution_certain: null,
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
    const firstParsed = parseAffiliation(getAffiliationString(authors[0]));
    const lastParsed = authors.length > 1
      ? parseAffiliation(getAffiliationString(authors[authors.length - 1]))
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

    // geo_* fields: always derived from first author
    const geoCountryR = firstParsed?.country ?? null;
    const geoCityR = firstParsed?.city ?? null;
    const geoInstitutionR = firstParsed?.institution ?? null;
    const geoContinentR = firstRegionR ? getContinent(firstRegionR) : null;
    const geoStateR = geoCityR && geoCountryR ? lookupState(geoCityR, geoCountryR) : null;

    const hasLastAuthorR = lastParsed !== null;
    const geoCountryCertainR = !hasLastAuthorR || lastParsed.country == null || lastParsed.country === firstParsed?.country;
    const geoStateCertainR = geoCountryCertainR;
    const geoCityCertainR = geoCountryCertainR && (!hasLastAuthorR || lastParsed.city == null || lastParsed.city === firstParsed?.city);
    const geoInstitutionCertainR = geoCityCertainR && (!hasLastAuthorR || lastParsed.institution == null || lastParsed.institution === firstParsed?.institution);

    updates.push({
      id: article.id,
      fields: {
        first_author_department: firstParsed?.department ?? null,
        first_author_institution: firstParsed?.institution ?? null,
        first_author_city: firstParsed?.city ?? null,
        first_author_country: firstParsed?.country ?? null,
        first_author_region: firstRegionR,
        last_author_department: lastParsed?.department ?? null,
        last_author_institution: lastParsed?.institution ?? null,
        last_author_city: lastParsed?.city ?? null,
        last_author_country: lastParsed?.country ?? null,
        last_author_region: lastRegionR,
        ...summaryR,
        location_parsed_at: new Date().toISOString(),
        location_confidence: overallConfidence,
        geo_continent: geoContinentR,
        geo_region: firstRegionR,
        geo_country: geoCountryR,
        geo_state: geoStateR,
        geo_city: geoCityR,
        geo_institution: geoInstitutionR,
        geo_country_certain: geoCountryCertainR,
        geo_state_certain: geoStateCertainR,
        geo_city_certain: geoCityCertainR,
        geo_institution_certain: geoInstitutionCertainR,
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
