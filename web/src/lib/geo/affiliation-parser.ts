/**
 * Deterministic affiliation parser for PubMed author affiliation strings.
 * No AI, no external APIs — pure string parsing.
 */

import { lookupCountry, CANONICAL_COUNTRIES, US_STATES } from "./country-map";

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

export function parseAffiliation(raw: string | null): ParsedAffiliation | null {
  // Step 1: Handle null/empty
  if (!raw || !raw.trim()) return null;

  // Step 2: Take first affiliation only (split on "; " or ".; ")
  let text = raw.split(/\.\s*;\s*|;\s+/)[0].trim();

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

  // Trim trailing dots and whitespace
  text = text.replace(/[.\s]+$/, "").trim();

  if (!text) return null;

  // Step 4: Split into segments
  const segments = text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const totalSegments = segments.length;

  // Step 5: Extract country (last segment)
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
          // Extract city from combined segment if it contains more than just the country
          // e.g. "A-8036 Graz Austria" → country=Austria, push back "A-8036 Graz"
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

    // If country is US, also check if the now-last segment is a US state abbreviation
    // e.g. segments = ["Dept...", "University of Minnesota", "Minneapolis", "MN"] and country=US
    // In this case "MN" should be consumed as the state, not the city
    if (isUS && segments.length > 0) {
      const maybeSt = segments[segments.length - 1].replace(/\.+$/, "").trim().toUpperCase();
      if (US_STATES[maybeSt]) {
        segments.pop(); // consume the state abbreviation
      }
    }
  }

  // Step 6: Extract city (now-last segment)
  let city: string | null = null;
  if (segments.length > 0) {
    let citySeg = segments[segments.length - 1];

    // Strip postal/zip codes: patterns like "A-8036", "1000", "75013", etc.
    citySeg = citySeg.replace(/\b[A-Z]?-?\d{3,6}\b/g, "").trim();
    // Also strip "P.O. Box NNN" patterns
    citySeg = citySeg.replace(/P\.?O\.?\s*Box\s*\d*/gi, "").trim();

    // Strip US state abbreviations if country is US
    if (isUS) {
      // Remove trailing 2-letter state code: "Minneapolis MN" or just "MN"
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

  // Step 7: Extract department and institution from remaining segments
  // First pass: assign segments that match keywords
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

  // Second pass: fill gaps with unmatched segments
  if (!department && !institution && unmatched.length === 1) {
    institution = unmatched[0];
  } else if (!department && unmatched.length > 0) {
    department = unmatched[0];
  } else if (!institution && unmatched.length > 0) {
    institution = unmatched[0];
  }

  // If no institution found but department found → swap
  if (!institution && department) {
    institution = department;
    department = null;
  }

  // Step 8: Determine confidence
  // Count effective parts: country + city + at least one of dept/inst
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
