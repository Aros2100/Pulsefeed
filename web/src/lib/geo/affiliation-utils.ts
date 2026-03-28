import type { ParsedAffiliation as ParsedAffiliationFull } from "./affiliation-parser";
import { getRegion, getContinent } from "./country-map";
import { lookupState } from "./state-map";
import { resolveCityAlias } from "./city-aliases";

/** Regex that matches a bare email address anywhere in a string */
const EMAIL_RE = /[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i;

/**
 * Extracts the first email address found in an affiliation string.
 * Strips "Electronic address:" / "E-mail:" prefix if present.
 */
export function extractEmail(raw: string): string | null {
  const match = raw.match(EMAIL_RE);
  return match?.[0] ?? null;
}

/**
 * Removes all email addresses (and their "Electronic address:" / "E-mail:" labels)
 * from an affiliation string, collapsing extra whitespace.
 */
export function stripEmailFromAffiliation(raw: string): string {
  return raw
    .replace(/\.\s*Electronic address:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\.\s*E-mail:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\.\s*email:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Geo fields ────────────────────────────────────────────────────────────────

export type GeoFields = {
  geo_continent: string | null;
  geo_region: string | null;
  geo_country: string | null;
  geo_state: string | null;
  geo_city: string | null;
  geo_department: string | null;
  geo_institution: string | null;
  location_confidence: "high" | "low" | null;
};

/**
 * Derives the geo_* fields and location_confidence from two parsed affiliations
 * (first and last author). Always derived from first author; certainty flags
 * compare first vs last author.
 */
export async function buildGeoFields(
  firstParsed: ParsedAffiliationFull | null,
  lastParsed: ParsedAffiliationFull | null
): Promise<GeoFields> {
  if (!firstParsed && !lastParsed) {
    return {
      geo_continent: null,
      geo_region: null,
      geo_country: null,
      geo_state: null,
      geo_city: null,
      geo_department: null,
      geo_institution: null,
      location_confidence: null,
    };
  }

  // Determine overall confidence
  let location_confidence: "high" | "low" | null = null;
  if (firstParsed && lastParsed) {
    location_confidence =
      firstParsed.confidence === "low" || lastParsed.confidence === "low"
        ? "low"
        : "high";
  } else {
    location_confidence = (firstParsed ?? lastParsed)!.confidence;
  }

  // geo_* fields: always derived from first author
  const geoCountry = firstParsed?.country ?? null;
  const geoCity = firstParsed?.city
    ? await resolveCityAlias(firstParsed.city, geoCountry ?? "")
    : null;
  const geoInstitution = firstParsed?.institution ?? null;
  const geoDepartment = firstParsed?.department ?? null;
  const geoRegion = geoCountry ? getRegion(geoCountry) : null;
  const geoContinent = geoCountry ? getContinent(geoCountry) : null;
  const geoState = geoCity && geoCountry ? lookupState(geoCity, geoCountry) : null;

  return {
    geo_continent: geoContinent,
    geo_region: geoRegion,
    geo_country: geoCountry,
    geo_state: geoState,
    geo_city: geoCity,
    geo_department: geoDepartment,
    geo_institution: geoInstitution,
    location_confidence,
  };
}
