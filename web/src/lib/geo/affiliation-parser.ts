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
  // Japanese address format: "8-35-1 Sakuragaoka", "1-6-10 Miyahara"
  if (/^\d+-\d+-\d+\s+\S/.test(s)) return true;
  // Street address: "1000 10th Ave", "130 E 77th St"
  if (/^\d+\s+.*\b(Ave|St|Rd|Blvd|Dr|Ln|Pl|Ct|Floor|Fl|Str)\b/i.test(s)) return true;
  // Brazilian CEP prefix: "CEP 14090-062"
  if (/^CEP\s+[\d\-]+$/i.test(s)) return true;
  // Japanese postal symbol: "〒650-0017"
  if (/^〒\d{3}-\d{4}$/.test(s)) return true;
  // Canadian postal codes: "H3T 1P1", "M5T 1P5", "V6T 1Z3"
  if (/^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/.test(s)) return true;
  // Province + Canadian postal: "QC H3T 1P1", "BC V6T 1Z3", "ON M5G 2G3"
  if (/^[A-Z]{2}\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/.test(s)) return true;
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
    // Guard: pair skal optræde som sammenhængende streng i segmentet
    if (!segment.includes(pair)) continue;
    if (cityNames.has(pair.trim().toLowerCase())) return pair;
  }
  // Then single words (skip short generic words)
  for (const word of words) {
    if (word.length >= 4 && !CITY_EXTRACT_BLOCKLIST.has(word.trim().toLowerCase()) && cityNames.has(word.trim().toLowerCase())) return word;
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
  // Strip leading Irish Eircode: "D09 V2N0 Dublin" → "Dublin"
  city = city.replace(/^[A-Z]\d{2}\s+[A-Z0-9]{4}\s+/, "").trim();
  // Strip INSERM/institution number prefix: "INSERM 1033 Lyon" → "Lyon"
  city = city.replace(/^INSERM\s+\d+\s+/i, "").trim();
  // Strip trailing country-prefixed postal codes: "Copenhagen DK-2100" → "Copenhagen", "Caen F-14000" → "Caen"
  city = city.replace(/\s+[A-Z]{1,2}-\d{3,6}$/, "").trim();
  // Strip trailing CEP codes: "São Paulo 04039-032" → "São Paulo"
  city = city.replace(/\s+\d{5}-\d{3}$/, "").trim();
  // Strip trailing alphanumeric postal codes: "Rotterdam 3015 GD" → "Rotterdam"
  city = city.replace(/\s+\d{4}\s+[A-Z]{2}$/, "").trim();
  // Strip embedded postal-like patterns: "Beyrouth 11-5076" → "Beyrouth"
  city = city.replace(/\s+\d{1,3}[-]\d{3,5}$/, "").trim();
  // Strip trailing 4-6 digit postcodes: "Seongnam-si 13488" → "Seongnam-si", "Manisa 45000" → "Manisa"
  city = city.replace(/\s+\d{4,6}$/, "").trim();
  // Strip trailing UK postcodes: "London WC1E 6DE", "London SE5 9RS", "Oxford OX1 3QT"
  city = city.replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "").trim();
  // Strip trailing Canadian postal codes: "Montreal H3A 0G4" → "Montreal"
  city = city.replace(/\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/, "").trim();
  // Strip trailing Irish Eircode suffixes: "Dublin D02 YN77" → "Dublin"
  city = city.replace(/\s+[A-Z]\d{2}\s+[A-Z0-9]{4}$/, "").trim();
  // Strip French Cedex suffixes: "Lyon Cedex 03" → "Lyon", "Toulon cedex 9" → "Toulon"
  city = city.replace(/\s+[Cc]edex\b.*$/i, "").trim();
  // Strip French CEDEX with diacritic: "Nîmes Cédex 9" → "Nîmes"
  city = city.replace(/\s+[Cc]é?dex\b.*$/i, "").trim();
  // Strip bare "Cedex N" if that's the entire value
  if (/^[Cc]é?dex\b/i.test(city)) city = "";
  // Re-strip trailing digits exposed by Cedex removal: "Paris 75940 CEDEX 19" → "Paris 75940" → "Paris"
  city = city.replace(/\s+\d{4,6}$/, "").trim();
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
  // Strip Korean administrative suffixes: "Suwon-si" → "Suwon", "Gwangju-si" → "Gwangju"
  city = city.replace(/-si$/i, "").trim();
  city = city.replace(/-gu$/i, "").trim();
  city = city.replace(/-do$/i, "").trim();
  // Strip trailing dots/whitespace
  city = city.replace(/[.\s]+$/, "").trim();
  return city;
}

// ── Missing-comma normalizer ────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Lazy-compiled regex: inserts a comma before a bare country name not already
// preceded by a comma. "Taiyuan China" → "Taiyuan, China".
// Sorted by descending length so multi-word names match before substrings.
let _countryCommaRe: RegExp | null = null;
function countryCommaRe(): RegExp {
  if (!_countryCommaRe) {
    const names = [...CANONICAL_COUNTRIES]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    // Common country aliases absent from the canonical list
    names.push("USA", "U\\.S\\.A\\.", "U\\.S\\.");
    _countryCommaRe = new RegExp(
      `(?<!,)\\s+(${names.join("|")})(?=[,.]|$)`,
      "g"
    );
  }
  return _countryCommaRe;
}

// Lazy-compiled regex: inserts a comma before a 2-letter US state abbreviation
// when immediately followed by a US country name variant.
// "Ann Arbor MI USA" → "Ann Arbor, MI, USA".
let _stateCommaRe: RegExp | null = null;
function stateCommaRe(): RegExp {
  if (!_stateCommaRe) {
    const abbrevs = Object.keys(US_STATES)
      .filter((k) => k.length === 2)
      .map(escapeRegExp);
    const usVariants = "United\\s+States|USA|U\\.S\\.A\\.|U\\.S\\.";
    _stateCommaRe = new RegExp(
      `(?<!,)\\s+(${abbrevs.join("|")})(?=\\s+(?:${usVariants})[,.]?)`,
      "g"
    );
  }
  return _stateCommaRe;
}

/** Insert commas before bare country names and US state+country sequences. */
function normalizeCommas(text: string): string {
  text = text.replace(countryCommaRe(), ", $1");
  text = text.replace(stateCommaRe(), ", $1");
  return text;
}

// ── Single-segment parser ───────────────────────────────────────────────────────

/**
 * Parse one clean affiliation segment (no semicolons) into structured geo fields.
 * Called by parseAffiliation for each semicolon-separated part.
 */
function parseSingleSegment(
  rawText: string,
  cityNames: Set<string>,
  cityCountryMap: Map<string, string>
): ParsedAffiliation | null {
  let text = rawText;

  // Step 2b: Insert missing commas before country names / US state abbreviations.
  // "Taiyuan China" → "Taiyuan, China"; "Ann Arbor MI USA" → "Ann Arbor, MI, USA"
  text = normalizeCommas(text);

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
      // Guard: if the affiliation string contains an explicit city that differs
      // from institution-map, trust the affiliation string over the map.
      const explicitCityInText = segments.slice(0, i).some(seg => {
        const cleaned = seg.replace(/\.+$/, "").trim();
        return (
          !looksLikeInstitution(cleaned) &&
          !isAdministrativeRegion(cleaned) &&
          !isPostalCode(cleaned) &&
          !lookupCountry(cleaned) &&
          cleaned.length >= 3 &&
          cleaned.length < 50 &&
          cityNames.has(cleaned.toLowerCase())
        );
      });
      if (explicitCityInText) {
        // Fall through to normal parsing — don't trust institution-map city
        break; // exits the for-loop at Step 6, continues to Step 7+
      }

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

  // Step 8: Extract city
  if (segments.length > 0) {
    // Even if cityFromCountryFallback is set, check remaining segments
    // for an explicit city that should take precedence over the province fallback
    let cityIdx = segments.length - 1;
    while (cityIdx >= 0) {
      const candidate = segments[cityIdx].replace(/\.+$/, "").trim();
      const candidateCleaned = candidate.replace(/\s+\d{4,6}$/, "").trim();
      if (isAdministrativeRegion(candidate) || isAdministrativeRegion(candidateCleaned)) { cityIdx--; continue; }
      if (candidate.length <= 4 && (US_STATES[candidate.toUpperCase()] || isProvinceCode(candidate))) { cityIdx--; continue; }
      if (isPostalCode(candidate)) { cityIdx--; continue; }
      if (lookupCountry(candidate) !== null) { cityIdx--; continue; }
      if (matchesKeywords(candidate, DEPT_KEYWORDS)) { cityIdx--; continue; }
      break;
    }

    if (cityIdx >= 0) {
      const rawCity = cleanCity(segments[cityIdx], cityNames);
      if (rawCity && cityNames.has(rawCity.trim().toLowerCase())) {
        // Explicit city found — overrides cityFromCountryFallback
        city = rawCity;
        segments.splice(cityIdx, 1);
      }
      // If not found in cityNames, leave cityFromCountryFallback city as-is
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

// ── Public API ──────────────────────────────────────────────────────────────────

export async function parseAffiliation(raw: string | null): Promise<ParsedAffiliation | null> {
  // Step 1: Handle null/empty
  if (!raw || !raw.trim()) return null;

  const { names: cityNames, countryMap: cityCountryMap } = await getCityCache();

  // Step 1b: Strip trailing author initials from raw string BEFORE splitting on ";"
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();

  // Step 1c: Strip parenthetic author-initial blocks anywhere in the string,
  // e.g. "(SZ, HY, YL, RH)" or "(AB, CD)". These are contribution lists, not locations.
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();

  // Step 2: Split on semicolons and try each part in order.
  // Returns the first part that resolves a country; falls back to the first
  // non-null result if none resolve a country.
  // Example: "...Fukui; and.; 2Dept..., Kyoto, Japan." — first part has no
  // country, second part does → returns Kyoto/Japan.
  const parts = text.split(/\.\s*;\s*|;\s+/).map((p) => p.trim()).filter(Boolean);

  let bestResult: ParsedAffiliation | null = null;
  for (const part of parts) {
    const result = parseSingleSegment(part, cityNames, cityCountryMap);
    if (result?.country) return result;
    if (!bestResult && result) bestResult = result;
  }
  return bestResult;
}
