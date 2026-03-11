/**
 * Deterministic affiliation parser for PubMed author affiliation strings.
 * No AI, no external APIs — pure string parsing.
 */

import { lookupCountry, CANONICAL_COUNTRIES, US_STATES } from "./country-map";
import { lookupInstitution } from "./institution-map";

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
];

function matchesKeywords(segment: string, keywords: string[]): boolean {
  const lower = segment.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Matches postal/zip code segments: pure digits, or letter-prefixed like "A-8036", "F-69008" */
function isPostalCode(segment: string): boolean {
  const s = segment.trim();
  return /^\d{3,6}$/.test(s) || /^[A-Z]{1,2}[-\s]?\d{3,6}$/i.test(s);
}

export function parseAffiliation(raw: string | null): ParsedAffiliation | null {
  // Step 1: Handle null/empty
  if (!raw || !raw.trim()) return null;

  // Step 1b: Strip trailing author initials from raw string BEFORE splitting on ";"
  // e.g. "Shanghai, 200120, China (H.X., T.J., C.Z., M.C.)." → "Shanghai, 200120, China"
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();

  // Step 2: Take first affiliation only (split on "; " or ".; ")
  text = text.split(/\.\s*;\s*|;\s+/)[0].trim();

  // Step 3: Clean
  // Remove "Electronic address: ..." and everything after
  text = text.replace(/\.\s*Electronic address:.*$/i, "").trim();
  text = text.replace(/Electronic address:.*$/i, "").trim();

  // Remove trailing email addresses
  text = text.replace(/\s*\S+@\S+\.[\w.]+\s*$/, "").trim();

  // Remove leading number prefixes: "1Department" → "Department"
  text = text.replace(/^\d+([A-Z])/, "$1");

  // Remove leading single lowercase letter prefix: "a Faculty" → "Faculty"
  text = text.replace(/^([a-z])\s+([A-Z])/, "$2");

  // Strip leading "From the " or "From " prefix
  text = text.replace(/^From\s+the\s+/i, "").replace(/^From\s+/i, "").trim();

  // Trim trailing dots and whitespace
  text = text.replace(/[.\s]+$/, "").trim();

  if (!text) return null;

  // Step 4: Split into segments
  const segments = text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  // Step 5: Remove ALL postal code segments from the array
  // This handles "Beijing, 100101, China" → ["Beijing", "China"]
  // and "Lyon, F-69008, France" → ["Lyon", "France"]
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (isPostalCode(seg)) {
      segments.splice(i, 1);
    } else {
      // Also handle "77030 USA" — zip+country combined in one segment
      const zipCountryMatch = seg.match(/^(\d{3,6})\s+(.+)$/);
      if (zipCountryMatch) {
        segments[i] = zipCountryMatch[2].trim();
      }
    }
  }

  if (segments.length === 0) return null;

  // Step 6: Check for known institution as last segment (early return)
  // Handles "Department of X, Aarhus University Hospital" with no city/country
  for (let i = segments.length - 1; i >= Math.max(0, segments.length - 2); i--) {
    const instInfo = lookupInstitution(segments[i]);
    if (instInfo) {
      // Check if any segment AFTER this one looks like a country
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

    // Direct lookup
    const directMatch = lookupCountry(lastSeg);
    if (directMatch) {
      country = directMatch;
      if (directMatch === "United States") isUS = true;
      segments.pop();
    } else {
      // Check if last segment is a US state abbreviation
      const upperLast = lastSeg.toUpperCase();
      if (US_STATES[upperLast]) {
        country = "United States";
        isUS = true;
        segments.pop();
      } else {
        // Substring match: check if last segment contains a known country name
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
          // Not recognized — set as country anyway with low confidence
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

  // Step 8: Extract city (now-last segment)
  let city: string | null = null;
  if (segments.length > 0) {
    let citySeg = segments[segments.length - 1];

    // Strip postal/zip codes embedded in city segment
    citySeg = citySeg.replace(/\b[A-Z]?-?\d{3,6}\b/g, "").trim();
    citySeg = citySeg.replace(/P\.?O\.?\s*Box\s*\d*/gi, "").trim();

    // Strip US state abbreviations if country is US
    if (isUS) {
      citySeg = citySeg.replace(/\s+[A-Z]{2}$/, "").trim();
    }

    // Strip trailing dots/whitespace
    citySeg = citySeg.replace(/[.\s]+$/, "").trim();

    if (citySeg) {
      city = citySeg;
      segments.pop();
    } else {
      confidence = "low";
      segments.pop();
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
