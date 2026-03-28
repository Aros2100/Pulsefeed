/**
 * AI-powered batch runner for low-confidence location articles.
 * Sends affiliations to Claude Haiku, cross-checks against deterministic parser results.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { aiParseAffiliation, type AIParsedLocation } from "./ai-location-parser";
import { lookupCountry, getRegion, getContinent } from "./country-map";
import { buildLocationSummary } from "./article-location-summary";
import { lookupState } from "./state-map";
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

/** Normalize country to canonical form for comparison */
function normalizeCountry(raw: string | null): string | null {
  if (!raw) return null;
  return lookupCountry(raw) ?? raw.trim();
}

function countriesMatch(a: string | null, b: string | null): boolean {
  const na = normalizeCountry(a);
  const nb = normalizeCountry(b);
  if (!na || !nb) return false;
  return na.toLowerCase() === nb.toLowerCase();
}

type AuthorResult = "resolved" | "conflicted" | "failed" | "skipped";

function crossCheck(
  existing: { city: string | null; country: string | null; department: string | null; institution: string | null },
  aiResult: AIParsedLocation | null
): { result: AuthorResult; fields: { department: string | null; institution: string | null; city: string | null; country: string | null } } {
  if (!aiResult) {
    return { result: "failed", fields: existing };
  }

  // Case 2: Parser had null city or country, AI has values
  if ((!existing.city || !existing.country) && (aiResult.city || aiResult.country)) {
    return {
      result: "resolved",
      fields: {
        department: aiResult.department ?? existing.department,
        institution: aiResult.institution ?? existing.institution,
        city: aiResult.city ?? existing.city,
        country: aiResult.country ?? existing.country,
      },
    };
  }

  // Case 1: Countries agree
  if (countriesMatch(existing.country, aiResult.country)) {
    return {
      result: "resolved",
      fields: {
        department: aiResult.department ?? existing.department,
        institution: aiResult.institution ?? existing.institution,
        city: aiResult.city ?? existing.city,
        country: aiResult.country ?? existing.country,
      },
    };
  }

  // Case 3: Countries disagree
  return { result: "conflicted", fields: existing };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AILocationResult = {
  processed: number;
  upgraded: number;
  conflicted: number;
  failed: number;
};

export async function runAILocationParsing(
  limit = 100
): Promise<AILocationResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: articles, error } = await db
    .from("articles")
    .select(
      "id, authors, geo_city, geo_country, geo_department, geo_institution"
    )
    .eq("location_confidence", "low")
    .not("location_parsed_at", "is", null)
    .eq("ai_location_attempted", false)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  type ArticleRow = {
    id: string;
    authors: unknown;
    geo_city: string | null;
    geo_country: string | null;
    geo_department: string | null;
    geo_institution: string | null;
  };

  const rows = (articles ?? []) as ArticleRow[];

  // Snapshot of previous geo state per article (for event logging)
  const prevGeoMap = new Map<string, GeoSnapshot>();
  for (const article of rows) {
    prevGeoMap.set(article.id, {
      geo_city: article.geo_city,
      geo_country: article.geo_country,
      geo_department: article.geo_department,
      geo_institution: article.geo_institution,
    });
  }

  let processed = 0;
  let upgraded = 0;
  let conflicted = 0;
  let failed = 0;

  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const article of rows) {
    if (!Array.isArray(article.authors) || article.authors.length === 0) {
      // No authors — mark as attempted, skip
      updates.push({
        id: article.id,
        fields: { ai_location_attempted: true },
      });
      continue;
    }

    processed++;
    const authors = article.authors as AuthorEntry[];
    const firstAffiliation = getAffiliationString(authors[0]);
    const lastAffiliation =
      authors.length > 1
        ? getAffiliationString(authors[authors.length - 1])
        : null;

    // AI parse first author
    let firstAI: AIParsedLocation | null = null;
    if (firstAffiliation) {
      firstAI = await aiParseAffiliation(firstAffiliation);
      await delay(200);
    }

    // AI parse last author
    let lastAI: AIParsedLocation | null = null;
    if (lastAffiliation) {
      lastAI = await aiParseAffiliation(lastAffiliation);
      await delay(200);
    }

    // Cross-check first author (geo_* fields hold first-author data)
    const firstCheck = firstAffiliation
      ? crossCheck(
          {
            city: article.geo_city,
            country: article.geo_country,
            department: article.geo_department,
            institution: article.geo_institution,
          },
          firstAI
        )
      : { result: "skipped" as AuthorResult, fields: { department: article.geo_department, institution: article.geo_institution, city: article.geo_city, country: article.geo_country } };

    // City→country fallback: if cross-check left country null but city is set, try city-cache
    if (firstCheck.fields.city && !firstCheck.fields.country) {
      const cityCache = await getCityCache();
      const c = cityCache.countryMap.get(normalizeCityKey(firstCheck.fields.city));
      if (c) firstCheck.fields.country = c;
    }

    // Determine overall outcome (first author only — last_author_* columns removed)
    const hasConflict = firstCheck.result === "conflicted";
    const hasResolved = firstCheck.result === "resolved";
    const allFailed = firstCheck.result === "failed";

    let newConfidence: "high" | "low" = "low";
    if (hasResolved && !hasConflict) {
      newConfidence = "high";
      upgraded++;
    } else if (hasConflict) {
      conflicted++;
    } else if (allFailed) {
      failed++;
    }

    const firstRegionAI = firstCheck.fields.country ? getRegion(firstCheck.fields.country) : null;
    const summaryAI = buildLocationSummary(
      { region: firstRegionAI, country: firstCheck.fields.country, city: firstCheck.fields.city, institution: firstCheck.fields.institution },
      { region: null, country: null, city: null, institution: null },
    );

    // geo_* fields: derived from first author result
    const geoCountryAI = firstCheck.fields.country;
    const geoCityAI = firstCheck.fields.city;
    const geoInstitutionAI = firstCheck.fields.institution;
    const geoDepartmentAI = firstCheck.fields.department;
    const geoRegionAI = firstRegionAI;
    const geoContinentAI = geoCountryAI ? getContinent(geoCountryAI) : null;
    // State: prefer AI result, fall back to state-map lookup
    const aiFirstState = firstAI?.state ?? null;
    const geoStateAI = aiFirstState ?? (geoCityAI && geoCountryAI ? lookupState(geoCityAI, geoCountryAI) : null);

    updates.push({
      id: article.id,
      fields: {
        geo_department: geoDepartmentAI,
        geo_institution: geoInstitutionAI,
        geo_city: geoCityAI,
        geo_country: geoCountryAI,
        geo_region: geoRegionAI,
        geo_continent: geoContinentAI,
        geo_state: geoStateAI,
        ...summaryAI,
        location_confidence: newConfidence,
        location_parsed_at: new Date().toISOString(),
        ai_location_attempted: true,
      },
    });
  }

  // Batch update in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => db.from("articles").update(u.fields).eq("id", u.id))
    );
  }

  // Fire geo_updated events (fire-and-forget)
  for (const u of updates) {
    const f = u.fields as Record<string, string | null>;
    const next: GeoSnapshot = {
      geo_city: f.geo_city ?? null,
      geo_country: f.geo_country ?? null,
      geo_state: f.geo_state ?? null,
      geo_region: f.geo_region ?? null,
      geo_continent: f.geo_continent ?? null,
      geo_institution: f.geo_institution ?? null,
      geo_department: f.geo_department ?? null,
    };
    logGeoUpdatedEvent(u.id, "enrichment", prevGeoMap.get(u.id) ?? null, next);
  }

  return { processed, upgraded, conflicted, failed };
}
