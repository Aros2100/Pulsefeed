/**
 * Deterministic affiliation parser for PubMed author affiliation strings.
 * No AI, no external APIs — pure string parsing.
 */

import { lookupCountry, CANONICAL_COUNTRIES, US_STATES } from "./country-map";
import { lookupInstitution } from "./institution-map";
import { isAdministrativeRegion } from "./region-map";

export type ParsedAffiliation = {
  department: string | null;
  institution: string | null;
  city: string | null;
  country: string | null;
  confidence: "high" | "low";
};

const DEPT_KEYWORDS = [
  "Department",
  "Division",
  "Section",
  "Unit",
  "Clinic of",
  "Laboratory",
  "Lab of",
];

const INST_KEYWORDS = [
  "University",
  "Hospital",
  "Medical Center",
  "Medical Centre",
  "School of Medicine",
  "College of Medicine",
  "Faculty of Medicine",
  "Academy",
  "Charité",
  "Karolinska",
  "Mayo Clinic",
  "Paracelsus",
  "Institut",
  "Institute",
  "Foundation",
  "College",
];

function matchesKeywords(segment: string, keywords: string[]): boolean {
  const lower = segment.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Matches postal/zip code segments */
function isPostalCode(segment: string): boolean {
  const s = segment.trim();
  // Pure digits 3-6 chars
  if (/^\d{3,6}$/.test(s)) return true;
  // Letter-prefixed: "A-8036", "F-69008", "DK-2650"
  if (/^[A-Z]{1,2}[-\s]?\d{3,6}$/i.test(s)) return true;
  // Postal codes with letters: "2300 RC"
  if (/^\d{3,5}\s+[A-Z]{1,3}$/i.test(s)) return true;
  // Patterns like "71-252"
  if (/^\d{2,3}-\d{2,4}$/.test(s)) return true;
  return false;
}

/** Matches phone number segments */
function isPhoneNumber(segment: string): boolean {
  return /^[\d\s\-+().]{7,}$/.test(segment.trim());
}

/** Check if segment looks like an institution name (not a city) */
function looksLikeInstitution(segment: string): boolean {
  const instWords = [
    "University", "Hospital", "Institute", "Medical Center", "Medical Centre",
    "College", "School", "Foundation", "Clinic", "Academy",
  ];
  const lower = segment.toLowerCase();
  return instWords.some((w) => lower.includes(w.toLowerCase()));
}

/** Clean city string: strip DK-prefix, postal codes, district suffixes */
function cleanCity(raw: string): string {
  let city = raw;
  // Strip leading "DK-NNNN " or "DK " prefix
  city = city.replace(/^DK[-\s]?\d{0,4}\s*/i, "").trim();
  // Strip leading letter-prefixed postal codes: "A-8036 Graz" → "Graz", "F-69008 Lyon" → "Lyon"
  city = city.replace(/^[A-Z]{1,2}[-\s]?\d{3,6}\s+/i, "").trim();
  // Strip leading pure digit postal codes: "8200 Aarhus" → "Aarhus", "2650 Hvidovre" → "Hvidovre"
  city = city.replace(/^\d{3,5}[-\s]+/, "").trim();
  // Strip embedded postal-like patterns: "Beyrouth 11-5076" → "Beyrouth"
  city = city.replace(/\s+\d{1,3}[-]\d{3,5}$/, "").trim();
  // Strip trailing postal district letter: "Aarhus N" → "Aarhus", "Odense C" → "Odense"
  const withoutSuffix = city.replace(/\s+[A-Z]$/, "");
  if (withoutSuffix.length >= 3) {
    city = withoutSuffix;
  }
  // Strip trailing dots/whitespace
  city = city.replace(/[.\s]+$/, "").trim();
  return city;
}

export function parseAffiliation(raw: string | null): ParsedAffiliation | null {
  // Step 1: Handle null/empty
  if (!raw || !raw.trim()) return null;

  // Step 1b: Strip trailing author initials from raw string BEFORE splitting on ";"
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();

  // Step 2: Take first affiliation only (split on "; " or ".; ")
  text = text.split(/\.\s*;\s*|;\s+/)[0].trim();

  // Step 3: Clean
  text = text.replace(/\.\s*Electronic address:.*$/i, "").trim();
  text = text.replace(/Electronic address:.*$/i, "").trim();
  text = text.replace(/\s*\S+@\S+\.[\w.]+\s*$/, "").trim();
  // Remove leading number prefixes: "1Department" → "Department", "1 Department" → "Department"
  text = text.replace(/^\d+\s*([A-Z])/, "$1");
  text = text.replace(/^([a-z])\s+([A-Z])/, "$2");
  text = text.replace(/^From\s+the\s+/i, "").replace(/^From\s+/i, "").trim();
  text = text.replace(/[.\s]+$/, "").trim();

  if (!text) return null;

  // Step 4: Split into segments
  const segments = text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  // Step 5: Remove postal code and phone number segments
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (isPostalCode(seg)) {
      segments.splice(i, 1);
    } else if (isPhoneNumber(seg)) {
      segments.splice(i, 1);
    } else {
      // Handle "77030 USA" — zip+country combined
      const zipCountryMatch = seg.match(/^(\d{3,6})\s+(.+)$/);
      if (zipCountryMatch) {
        segments[i] = zipCountryMatch[2].trim();
      }
    }
  }

  if (segments.length === 0) return null;

  // Step 6: Check for known institution as last segment (early return)
  for (let i = segments.length - 1; i >= Math.max(0, segments.length - 2); i--) {
    const instInfo = lookupInstitution(segments[i]);
    if (instInfo) {
      const hasCountryAfter = segments.slice(i + 1).some((s) => {
        const cleaned = s.replace(/\.+$/, "").trim();
        return lookupCountry(cleaned) !== null || US_STATES[cleaned.toUpperCase()] !== undefined;
      });

      if (!hasCountryAfter) {
        let department: string | null = null;
        const institution = segments[i];

        for (let j = 0; j < i; j++) {
          if (matchesKeywords(segments[j], DEPT_KEYWORDS)) {
            department = segments[j];
            break;
          }
        }
        if (!department && i > 0) {
          department = segments[0];
        }

        return {
          department,
          institution,
          city: instInfo.city,
          country: instInfo.country,
          confidence: "high",
        };
      }
    }
  }

  // Step 7: Extract country (last segment)
  let country: string | null = null;
  let confidence: "high" | "low" = "high";
  let isUS = false;

  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1].replace(/\.+$/, "").trim();

    const directMatch = lookupCountry(lastSeg);
    if (directMatch) {
      country = directMatch;
      if (directMatch === "United States") isUS = true;
      segments.pop();
    } else {
      const upperLast = lastSeg.toUpperCase();
      if (US_STATES[upperLast]) {
        country = "United States";
        isUS = true;
        segments.pop();
      } else {
        const lowerLast = lastSeg.toLowerCase();
        const found = CANONICAL_COUNTRIES.find((c) =>
          lowerLast.includes(c.toLowerCase())
        );
        if (found) {
          country = found;
          if (found === "United States") isUS = true;
          const countryIdx = lowerLast.lastIndexOf(found.toLowerCase());
          const beforeCountry = lastSeg.slice(0, countryIdx).trim();
          segments.pop();
          if (beforeCountry) {
            segments.push(beforeCountry);
          }
        } else {
          confidence = "low";
          country = lastSeg;
          segments.pop();
        }
      }
    }

    // Consume US state abbreviation or full state name after country
    if (isUS && segments.length > 0) {
      const maybeSt = segments[segments.length - 1].replace(/\.+$/, "").trim();
      const maybeStUpper = maybeSt.toUpperCase();
      if (US_STATES[maybeStUpper]) {
        segments.pop();
      } else if (lookupCountry(maybeSt) === "United States") {
        segments.pop();
      }
    }
  }

  // Step 8: Extract city — walk right to left, skip administrative regions
  let city: string | null = null;
  if (segments.length > 0) {
    // Find city: skip regions/postal codes from the right
    let cityIdx = segments.length - 1;
    while (cityIdx >= 0) {
      const candidate = segments[cityIdx].replace(/\.+$/, "").trim();
      if (isAdministrativeRegion(candidate)) {
        cityIdx--;
        continue;
      }
      // Also skip if it's a postal code that slipped through
      if (isPostalCode(candidate)) {
        cityIdx--;
        continue;
      }
      break;
    }

    if (cityIdx >= 0) {
      const rawCity = cleanCity(segments[cityIdx]);

      if (rawCity) {
        // Check if the "city" actually looks like an institution
        if (looksLikeInstitution(rawCity)) {
          const instInfo = lookupInstitution(segments[cityIdx]);
          if (instInfo) {
            city = instInfo.city;
            // Don't remove this segment — it will be picked up as institution in step 9
          } else {
            confidence = "low";
            city = rawCity;
            segments.splice(cityIdx, 1);
          }
        } else {
          city = rawCity;
          segments.splice(cityIdx, 1);
        }
      } else {
        confidence = "low";
        segments.splice(cityIdx, 1);
      }
    }

    // Also remove consumed region segments so they don't pollute dept/inst extraction
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\.+$/, "").trim();
      if (isAdministrativeRegion(seg)) {
        segments.splice(i, 1);
      }
    }
  }

  // Step 9: Extract department and institution from remaining segments
  let department: string | null = null;
  let institution: string | null = null;
  const unmatched: string[] = [];

  for (const seg of segments) {
    const isDept = matchesKeywords(seg, DEPT_KEYWORDS);
    const isInst = matchesKeywords(seg, INST_KEYWORDS);

    if (isDept && isInst) {
      if (!institution) institution = seg;
      else if (!department) department = seg;
    } else if (isInst) {
      if (!institution) institution = seg;
    } else if (isDept) {
      if (!department) department = seg;
    } else {
      unmatched.push(seg);
    }
  }

  if (!department && !institution && unmatched.length === 1) {
    institution = unmatched[0];
  } else if (!department && unmatched.length > 0) {
    department = unmatched[0];
  } else if (!institution && unmatched.length > 0) {
    institution = unmatched[0];
  }

  if (!institution && department) {
    institution = department;
    department = null;
  }

  // Step 10: Determine confidence
  const hasParts = (country ? 1 : 0) + (city ? 1 : 0) + (institution ? 1 : 0) + (department ? 1 : 0);
  if (
    country &&
    lookupCountry(country) &&
    city &&
    hasParts >= 3
  ) {
    if (confidence !== "low") confidence = "high";
  } else {
    confidence = "low";
  }

  return { department, institution, city, country, confidence };
}
