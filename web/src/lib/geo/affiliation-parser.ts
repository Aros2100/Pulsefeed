/**
 * Deterministic affiliation parser for PubMed author affiliation strings.
 * No AI, no external APIs — pure string parsing.
 */

import { lookupCountry, CANONICAL_COUNTRIES, US_STATES } from "./country-map";
import { lookupInstitution } from "./institution-map";
import { isAdministrativeRegion, isProvinceCode } from "./region-map";
import { lookupCity } from "./city-map";
import { getCityCache } from "./city-cache";

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
  "Clinic",
  "Mayo Clinic",
  "Paracelsus",
  "Institut",
  "Institute",
  "Foundation",
  "College",
  "Hospices",
  "Fondazione",
  "IRCCS",
  "Kantonsspital",
  "Universität",
  "Università",
  "Université",
  "Universidad",
  "Universidade",
  "Instituto",
  "Istituto",
  "Health System",
  "Guideline Group",
  "Policlinico",
  "Klinikum",
  "Kliniken",
  "Hôpital",
  "Hôpitaux",
  "Sjukhus",
  "Sygehus",
  "Ziekenhuis",
  "Krankenhaus",
  "Red Cross",
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
  return matchesKeywords(segment, INST_KEYWORDS);
}

const CITY_EXTRACT_BLOCKLIST = new Set([
  'university', 'hospital', 'institute', 'college', 'school',
  'center', 'centre', 'clinic', 'academy', 'laboratory',
  'medical', 'research', 'foundation', 'faculty', 'department',
  'division', 'section', 'unit', 'surgery', 'sciences',
  'national', 'general', 'central', 'regional', 'memorial',
  'children', 'veterans', 'military', 'naval', 'royal',
  'health', 'system', 'ministry', 'guideline', 'network',
  'reference', 'member', 'corporate', 'fondazione',
]);

/** Try to extract a city name embedded in an institution segment */
function extractCityFromSegment(segment: string, cityNames: Set<string>): string | null {
  const words = segment.split(/\s+/);
  // Check pairs of words first (longer match = better, e.g. "New Haven", "Hong Kong")
  for (let i = 0; i < words.length - 1; i++) {
    const pair = words[i] + " " + words[i + 1];
    const w1blocked = CITY_EXTRACT_BLOCKLIST.has(words[i].toLowerCase());
    const w2blocked = CITY_EXTRACT_BLOCKLIST.has(words[i + 1].toLowerCase());
    if (w1blocked && w2blocked) continue;
    if (cityNames.has(pair.toLowerCase())) return pair;
  }
  // Then single words (skip short generic words)
  for (const word of words) {
    if (word.length >= 4 && !CITY_EXTRACT_BLOCKLIST.has(word.toLowerCase()) && cityNames.has(word.toLowerCase())) return word;
  }
  return null;
}

/** Clean city string: strip DK-prefix, postal codes, district suffixes, UK postcodes */
function cleanCity(raw: string, cityNames: Set<string>): string {
  // If entire string is a UK postcode, return empty
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(raw.trim())) return "";
  let city = raw;
  // Strip leading "DK-NNNN " or "DK " prefix
  city = city.replace(/^DK[-\s]?\d{0,4}\s*/i, "").trim();
  // Strip leading country/region prefix codes: "SE_17176 Stockholm", "SE-17176 Stockholm"
  city = city.replace(/^[A-Z]{2}[-_]\d{4,5}\s+/i, "").trim();
  // Strip leading letter-prefixed postal codes: "A-8036 Graz" → "Graz", "F-69008 Lyon" → "Lyon"
  city = city.replace(/^[A-Z]{1,2}[-\s]?\d{3,6}\s+/i, "").trim();
  // Strip leading pure digit postal codes: "8200 Aarhus" → "Aarhus", "93 Lodz" → "Lodz"
  city = city.replace(/^\d{2,5}[-\s]+/, "").trim();
  // Strip embedded postal-like patterns: "Beyrouth 11-5076" → "Beyrouth"
  city = city.replace(/\s+\d{1,3}[-]\d{3,5}$/, "").trim();
  // Strip trailing 4-6 digit postcodes: "Seongnam-si 13488" → "Seongnam-si", "Manisa 45000" → "Manisa"
  city = city.replace(/\s+\d{4,6}$/, "").trim();
  // Strip trailing UK postcodes: "London WC1E 6DE", "London SE5 9RS", "Oxford OX1 3QT"
  city = city.replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "").trim();
  // Strip trailing postal district letter (including Nordic: Ø, Ö, Ü, Æ, Å)
  const withoutSuffix = city.replace(/\s+[A-ZØÖÜÆÅ]$/u, "");
  if (withoutSuffix.length >= 3) {
    city = withoutSuffix;
  }
  // Strip trailing US state name from city: "Portland Oregon" → "Portland"
  const lastSpaceIdx = city.lastIndexOf(" ");
  if (lastSpaceIdx > 2) {
    const maybeState = city.slice(lastSpaceIdx + 1);
    if (lookupCountry(maybeState) === "United States") {
      city = city.slice(0, lastSpaceIdx).trim();
    }
  }
  // Strip " - State of ..." suffix (Brazilian cities: "São Paulo - State of São Paulo")
  city = city.replace(/\s+-\s+State\s+of\s+.*$/i, "").trim();
  // Strip trailing "City" if the base name is a known city (e.g. "Mexico City" → "Mexico" only if "Mexico" is in city names)
  if (city.endsWith(" City")) {
    const base = city.slice(0, -5).trim();
    if (base && cityNames.has(base.toLowerCase())) {
      city = base;
    }
  }
  // Strip trailing dots/whitespace
  city = city.replace(/[.\s]+$/, "").trim();
  return city;
}

export async function parseAffiliation(raw: string | null): Promise<ParsedAffiliation | null> {
  // Step 1: Handle null/empty
  if (!raw || !raw.trim()) return null;

  const { names: cityNames, countryMap: cityCountryMap } = await getCityCache();

  // Step 1b: Strip trailing author initials from raw string BEFORE splitting on ";"
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();

  // Step 2: Take first affiliation only (split on "; " or ".; ")
  text = text.split(/\.\s*;\s*|;\s+/)[0].trim();

  // Step 3: Clean
  text = text.replace(/\.\s*Electronic address:.*$/i, "").trim();
  text = text.replace(/Electronic address:.*$/i, "").trim();
  text = text.replace(/\s*\S+@\S+\.[\w.]+\s*$/, "").trim();
  // Strip trailing domain names: "iums.ac.ir"
  text = text.replace(/\s*[\w.-]+\.(ac|edu|org|com|gov|net)\.[a-z]{2,4}\s*$/i, "").trim();
  // Remove leading number prefixes: "1Department" → "Department", "1 Department" → "Department"
  text = text.replace(/^\d+\s*([A-Z])/, "$1");
  text = text.replace(/^([a-z])\s+([A-Z])/, "$2");
  text = text.replace(/^From\s+the\s+/i, "").replace(/^From\s+/i, "").trim();
  text = text.replace(/[.\s]+$/, "").trim();

  if (!text) return null;

  // Step 3c: Strip parenthesized content BEFORE comma-splitting
  // Removes author-name lists like "(Docherty, Shabalin, DiBlasi, Coon)"
  // and single author refs like "(D.A.L.)" or "(J.D.)"
  text = text.replace(/\s*\([A-Z][A-Za-z.\-,\s]*\)/g, "").trim();
  if (!text) return null;

  // Step 3b: Reject department/division-only affiliations with no location data
  if (/^(Departments?|Divisions?|Sections?|Units?|Clinics?)\s+of\s*/i.test(text) && !text.includes(",")) {
    return null;
  }
  // Too long — multi-institution monster strings that parser can't handle
  if (text.length > 350) {
    return null;
  }
  // Reject "and ..." fragments (partial author lists leaking through)
  if (/^and\s+/i.test(text)) return null;
  // Reject "contributed equally" notes
  if (/contributed equally/i.test(text)) return null;
  // Reject author initial fragments like "J.I." or "S. M."
  if (/^[A-Z]\.\s?[A-Z]\.?$/.test(text.trim())) return null;
  // Reject "Full Member of" / "Corporate Member of" lines
  if (/^(Full|Corporate)\s+Member\s+of\b/i.test(text)) return null;
  // Reject "Ministry of" lines
  if (/^Ministry\s+of\b/i.test(text)) return null;
  // Reject "Republic of" fragments
  if (/^Republic\s+of\b/i.test(text) && !text.includes(",")) return null;
  // Reject "P. R" / "P.R." — People's Republic abbreviation
  if (/^P\.\s*R\.?$/i.test(text.trim())) return null;

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

  // Step 5b: Strip author-name parentheses from segments
  // Matches: "(Docherty, Shabalin, Coon)", "(A.K.)", "(J.I., S. M.)"
  for (let i = 0; i < segments.length; i++) {
    segments[i] = segments[i]
      .replace(/\s*\([A-Za-z][A-Za-z.\-,\s]*\)\s*/g, "")
      .trim();
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i]) segments.splice(i, 1);
  }
  // Strip orphan closing parenthesis segments: "Coon)" → remove
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].includes(")") && !segments[i].includes("(")) {
      segments.splice(i, 1);
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
  let cityFromCountryFallback = false;
  let city: string | null = null;

  if (segments.length > 0) {
    let lastSeg = segments[segments.length - 1].replace(/\.+$/, "").trim();
    // Strip trailing noise: " and ...", " - "
    lastSeg = lastSeg.replace(/\s+and\s+.*$/i, "").trim();
    lastSeg = lastSeg.replace(/\s+-\s*$/, "").trim();

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
        // City-to-country fallback: check if last segment is a known city/province
        const cityMatch = lookupCity(lastSeg);
        if (cityMatch) {
          country = cityMatch.country;
          city = cityMatch.city;
          cityFromCountryFallback = true;
          if (cityMatch.country === "United States") isUS = true;
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
            // Last segment is not a recognized country — don't use it as country
            confidence = "low";
            // Don't pop — leave segment for dept/inst extraction
          }
        }
      }
    }

    // Strip short segments that are ≤4 chars and only uppercase+dots (e.g. "D.C", "D.C.")
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\.+$/, "").trim();
      if (seg.length <= 4 && /^[A-Z.]+$/i.test(seg) && seg.includes(".")) {
        segments.splice(i, 1);
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
  if (!cityFromCountryFallback && segments.length > 0) {
    // Find city: skip regions/postal codes/province codes from the right
    let cityIdx = segments.length - 1;
    while (cityIdx >= 0) {
      const candidate = segments[cityIdx].replace(/\.+$/, "").trim();
      // Also check region after stripping trailing postcodes: "Guangdong 510000" → "Guangdong"
      const candidateCleaned = candidate.replace(/\s+\d{4,6}$/, "").trim();
      if (isAdministrativeRegion(candidate) || isAdministrativeRegion(candidateCleaned)) {
        cityIdx--;
        continue;
      }
      // Skip 2-4 letter province/state codes: ON, QC, BC, CA, TX, NSW, VIC, SASK, ALTA, etc.
      if (candidate.length <= 4 && (US_STATES[candidate.toUpperCase()] || isProvinceCode(candidate))) {
        cityIdx--;
        continue;
      }
      // Also skip if it's a postal code that slipped through
      if (isPostalCode(candidate)) {
        cityIdx--;
        continue;
      }
      // Skip segments that are country names/aliases (e.g., "England", "Scotland", "Wales")
      if (lookupCountry(candidate) !== null) {
        cityIdx--;
        continue;
      }
      // Skip segments that look like department names (not cities)
      if (matchesKeywords(candidate, DEPT_KEYWORDS)) {
        cityIdx--;
        continue;
      }
      break;
    }

    if (cityIdx >= 0) {
      const rawCity = cleanCity(segments[cityIdx], cityNames);

      // Check if cleaned city is actually a country name (e.g. "Rwanda")
      // but allow names that are also known cities (e.g. "Singapore")
      if (rawCity && lookupCountry(rawCity) !== null && !cityNames.has(rawCity.toLowerCase())) {
        segments.splice(cityIdx, 1);
        cityIdx = -1;
      }
      if (cityIdx >= 0 && rawCity) {
        // Check if the "city" actually looks like an institution
        if (looksLikeInstitution(rawCity)) {
          const instInfo = lookupInstitution(segments[cityIdx]);
          if (instInfo) {
            city = instInfo.city;
            // Don't remove this segment — it will be picked up as institution in step 9
          } else {
            // Has institution keywords but not in institution-map → try extracting city from segment
            const extracted = extractCityFromSegment(segments[cityIdx], cityNames);
            city = extracted;
            // Don't splice — leave for Step 9 to pick up as institution
          }
        } else {
          // Also try institution-map even if keywords don't match (e.g. "Kliniken")
          const instInfo2 = lookupInstitution(segments[cityIdx]);
          if (instInfo2) {
            city = instInfo2.city;
            // Don't remove — will be picked up as institution in step 9
          } else if (cityNames.has(rawCity.toLowerCase())) {
            // Validated against GeoNames city set
            city = rawCity;
            segments.splice(cityIdx, 1);
          } else if (rawCity.length >= 30) {
            // Long unknown string — almost certainly an institution, not a city
            city = null;
            // Don't splice — leave for Step 9 to pick up as institution
          } else {
            // Short unknown — could be a small city not in GeoNames
            confidence = "low";
            city = rawCity;
            segments.splice(cityIdx, 1);
          }
        }
      } else if (cityIdx >= 0) {
        confidence = "low";
        segments.splice(cityIdx, 1);
      }
    }

    // Also remove consumed region/province-code segments so they don't pollute dept/inst extraction
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\.+$/, "").trim();
      const segCleaned = seg.replace(/\s+\d{4,6}$/, "").trim();
      if (isAdministrativeRegion(seg) || isAdministrativeRegion(segCleaned)) {
        segments.splice(i, 1);
      } else if (seg.length <= 3 && (US_STATES[seg.toUpperCase()] || isProvinceCode(seg))) {
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

  // Step 11: City-to-country fallback
  if (city && !country) {
    const cityInfo = lookupCity(city);
    if (cityInfo) {
      country = cityInfo.country;
    } else {
      const fallback = cityCountryMap.get(city.toLowerCase());
      if (fallback) country = fallback;
    }
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
