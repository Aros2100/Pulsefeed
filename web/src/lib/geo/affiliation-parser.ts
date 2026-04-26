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
  // Strip postal code glued directly to city name without space: "Berlin12345" → "Berlin"
  city = city.replace(/^([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s\-]+?)\d{4,6}$/, "$1").trim();
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
  // Strip trailing "City" if the base name is a known city AND NOT an administrative region.
  // Protects "Province City" patterns (e.g. "Quebec City" stays "Quebec City", not "Quebec").
  if (city.endsWith(" City")) {
    const base = city.slice(0, -5).trim();
    if (base && cityNames.has(base.toLowerCase()) && !isAdministrativeRegion(base)) {
      city = base;
    }
  }
  // Strip Japanese -City suffix: "Kagoshima-City" → "Kagoshima"
  city = city.replace(/-City$/i, "").trim();
  // Strip " City" suffix UNLESS base is admin region (protects "Quebec City", "Oklahoma City")
  if (/\s+City$/i.test(city)) {
    const base = city.replace(/\s+City$/i, "").trim();
    if (!isAdministrativeRegion(base)) {
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

const CANADIAN_PROVINCES: Record<string, string> = {
  "ONT": "Ontario", "BC": "British Columbia", "ALTA": "Alberta",
  "QUE": "Quebec", "MAN": "Manitoba", "SASK": "Saskatchewan",
  "NS": "Nova Scotia", "NB": "New Brunswick", "PEI": "Prince Edward Island",
  "NFLD": "Newfoundland", "NWT": "Northwest Territories", "YT": "Yukon",
};

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
    // (?<! of) prevents splitting "University of Hong Kong" → "University of, Hong Kong"
    // (?<!\bNew ) prevents splitting "New Mexico" → "New, Mexico" and "New Zealand" → "New, Zealand"
    _countryCommaRe = new RegExp(
      `(?<!,)(?<! of)(?<!\\bNew )\\s+(${names.join("|")})(?=[,.]|$)`,
      "g"
    );
  }
  return _countryCommaRe;
}

// Brazilian state abbreviations (2 letters, all 27 federative units)
const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

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

// Lazy-compiled regex: inserts a comma before a 2-letter Brazilian state abbreviation
// when immediately followed by "Brazil". "São Paulo SP, Brazil" → "São Paulo, SP, Brazil".
let _brStateCommaRe: RegExp | null = null;
function brStateCommaRe(): RegExp {
  if (!_brStateCommaRe) {
    const abbrevs = BRAZILIAN_STATES.map(escapeRegExp);
    _brStateCommaRe = new RegExp(
      `(?<!,)\\s+(${abbrevs.join("|")})(?=,\\s*Brazil\\b)`,
      "g"
    );
  }
  return _brStateCommaRe;
}

/**
 * If a segment is "US state abbrev + ZIP" (e.g. "NY 10029", "CA 91361-1234"),
 * returns just the state abbrev. Otherwise returns null.
 *
 * Used by step 5 to preserve state information when stripping a ZIP that's
 * glued to a state abbrev.
 */
function extractUsStateFromZipSegment(segment: string): string | null {
  const s = segment.trim();
  const match = s.match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/);
  if (!match) return null;
  const stateAbbr = match[1];
  if (US_STATES[stateAbbr]) return stateAbbr;
  return null;
}

/** Insert commas before bare country names and US state+country sequences. */
function normalizeCommas(text: string): string {
  text = text.replace(countryCommaRe(), ", $1");
  text = text.replace(stateCommaRe(), ", $1");
  text = text.replace(brStateCommaRe(), ", $1");
  return text;
}

// ── Single-segment parser ───────────────────────────────────────────────────────

/**
 * Parse one clean affiliation segment (no semicolons) into structured geo fields.
 * Called by parseAffiliation for each semicolon-separated part.
 * When `trace` is provided, key decision points are appended to it.
 */
function parseSingleSegment(
  rawText: string,
  cityNames: Set<string>,
  cityCountryMap: Map<string, string>,
  trace?: string[]
): ParsedAffiliation | null {
  let text = rawText;

  // Step 2a: Strip "the" before country names that take a definite article in English.
  // "Rotterdam, the Netherlands" → "Rotterdam, Netherlands" (avoids comma-split into "the" + "Netherlands")
  text = text.replace(/\bthe\s+(Netherlands|Philippines|Czech Republic|United Arab Emirates|United Kingdom|Gambia|Bahamas|Maldives|Comoros|Seychelles)\b/gi, "$1");

  // Step 2b: Insert missing commas before country names / US state abbreviations.
  // "Taiyuan China" → "Taiyuan, China"; "Ann Arbor MI USA" → "Ann Arbor, MI, USA"
  text = normalizeCommas(text);

  // Step 2c: Split on country name directly followed by uppercase letter without separator.
  // "Denmark Laboratory for..." → "Denmark; Laboratory for..."
  // (?!City\b) prevents splitting "Mexico City", "Guatemala City", etc.
  text = text.replace(
    new RegExp(`(${CANONICAL_COUNTRIES.map(escapeRegExp).join("|")})\\s+(?!City\\b)(?=[A-Z])`, "g"),
    "$1; "
  );

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
  // Reject "Ministry of" lines (only if no comma — comma means there's geo data after it)
  if (/^Ministry\s+of\b/i.test(text) && !text.includes(",")) return null;
  // Reject "Republic of" fragments
  if (/^Republic\s+of\b/i.test(text) && !text.includes(",")) return null;
  // Reject "P. R" / "P.R." — People's Republic abbreviation
  if (/^P\.\s*R\.?$/i.test(text.trim())) return null;

  // Step 4: Split into segments
  const segments = text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  trace?.push(`step4: split → [${segments.map(s => JSON.stringify(s)).join(", ")}]`);
  if (segments.length === 0) return null;

  // Step 5: Remove postal code and phone number segments
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (isPostalCode(seg)) {
      // Preserve US state abbrev if segment is "STATE ZIP" (e.g. "NY 10029" → "NY")
      const preservedState = extractUsStateFromZipSegment(seg);
      if (preservedState) {
        segments[i] = preservedState;
      } else {
        segments.splice(i, 1);
      }
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

  trace?.push(`step5: after postal removal → [${segments.map(s => JSON.stringify(s)).join(", ")}]`);
  if (segments.length === 0) return null;

  // Step 6: Check for known institution as last segment (early return)
  let institutionFallbackCity: string | null = null;
  for (let i = segments.length - 1; i >= Math.max(0, segments.length - 2); i--) {
    const instInfo = lookupInstitution(segments[i]);
    trace?.push(`step6: lookupInstitution(${JSON.stringify(segments[i])}) → ${instInfo ? `{city:${instInfo.city}, country:${instInfo.country}}` : "null"}`);
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

      if (hasCountryAfter) {
        if (!institutionFallbackCity) {
          institutionFallbackCity = instInfo.city;
          trace?.push(`step6: hasCountryAfter — saved institutionFallbackCity=${JSON.stringify(instInfo.city)}`);
        }
      } else {
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

        trace?.push(`step6: early-return via institution-map → city=${instInfo.city} country=${instInfo.country}`);
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

    // Check US state (incl. full names like "Georgia", "Virginia") before country lookup
    // to avoid "Georgia" matching the country Georgia instead of the US state.
    const upperLast = lastSeg.toUpperCase();
    // Strip dots for punctuated abbreviations: "N.Y." → "NY", "B.C." → "BC", "Alta." → "ALTA"
    const depuncted = lastSeg.replace(/\./g, "").toUpperCase();
    // Unaccented fallback for diacritic country names: "Sénégal" → "Senegal"
    const unaccentedLast = lastSeg.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const directMatch = lookupCountry(lastSeg) ?? (unaccentedLast !== lastSeg ? lookupCountry(unaccentedLast) : null);
    if (US_STATES[upperLast]) {
      country = "United States";
      isUS = true;
      segments.pop();
    } else if (US_STATES[depuncted] && depuncted !== upperLast) {
      // Punctuated US state abbreviations: "N.Y." → NY, "N.J." → NJ, "D.C." → DC
      country = "United States";
      isUS = true;
      segments.pop();
    } else if (CANADIAN_PROVINCES[depuncted]) {
      // Canadian province abbreviations: "Ont." → ONT, "B.C." → BC, "Alta." → ALTA
      country = "Canada";
      segments.pop();
    } else if (directMatch) {
      country = directMatch;
      if (directMatch === "United States") isUS = true;
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
          trace?.push(`step7: no country match for lastSeg=${JSON.stringify(lastSeg)} → confidence=low`);
        }
      }
    }
    trace?.push(`step7: country=${JSON.stringify(country)} isUS=${isUS} cityFromFallback=${cityFromCountryFallback} remainingSegments=[${segments.map(s => JSON.stringify(s)).join(", ")}]`);

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
        // If maybeSt is also a known city (e.g. "New York" is both state and city),
        // only pop it if another remaining segment is a known city. Otherwise
        // leave it for step 8 to pick up as the city.
        const isAlsoCity = cityNames.has(maybeSt.toLowerCase()) || !!lookupCity(maybeSt);
        if (isAlsoCity) {
          const hasAlternativeCity = segments.slice(0, -1).some((seg) => {
            const cleaned = seg.replace(/\.+$/, "").trim();
            return cityNames.has(cleaned.toLowerCase()) || !!lookupCity(cleaned);
          });
          if (hasAlternativeCity) {
            trace?.push(`step7: consumed US state abbreviation ${JSON.stringify(maybeSt)} (alternative city found)`);
            segments.pop();
          } else {
            trace?.push(`step7: skip state-pop — ${JSON.stringify(maybeSt)} also a known city, no alternative`);
            // Don't pop — leave for step 8
          }
        } else {
          trace?.push(`step7: consumed US state abbreviation ${JSON.stringify(maybeSt)}`);
          segments.pop();
        }
      } else if (lookupCountry(maybeSt) === "United States") {
        // Only pop a full state name if it's not the last remaining segment —
        // otherwise the city scanner still needs it (e.g. "New York" as city).
        if (segments.length > 1) {
          trace?.push(`step7: consumed US full state name ${JSON.stringify(maybeSt)}`);
          segments.pop();
        }
      }
    }
    trace?.push(`step7: after state-consume → segments=[${segments.map(s => JSON.stringify(s)).join(", ")}]`);
  }

  // Step 8: Extract city — scan from right, continue if no city match at current segment
  if (segments.length > 0) {
    let cityIdx = segments.length - 1;
    while (cityIdx >= 0) {
      const candidate = segments[cityIdx].replace(/\.+$/, "").trim();
      const candidateCleaned = candidate.replace(/\s+\d{4,6}$/, "").trim();
      trace?.push(`step8: trying cityIdx=${cityIdx} candidate=${JSON.stringify(candidate)}`);

      // Skip admin regions — but allow through if they are a known city (e.g. "New York" city
      // after the state "New York" has already been consumed in Step 7).
      const isAdmin = isAdministrativeRegion(candidate) || isAdministrativeRegion(candidateCleaned);
      if (isAdmin) {
        const adminKey = candidate.trim().toLowerCase();
        const adminIsCity = cityNames.has(adminKey) || !!lookupCity(candidate);
        // Explicit fallthrough for US state names that are also known cities (e.g. "New York")
        const isUSStateCity = !!US_STATES[candidate.trim().toUpperCase()] && cityNames.has(adminKey);
        if (!adminIsCity && !isUSStateCity) {
          trace?.push(`step8: skip — isAdmin and not a city`);
          cityIdx--;
          continue;
        }
        // Even if admin-region is also a known city, skip it if a better city
        // candidate exists earlier in segments (e.g. "Toronto, Ontario" → skip Ontario, use Toronto)
        if (adminIsCity) {
          const hasEarlierCity = segments.slice(0, cityIdx).some((seg) => {
            const cleaned = seg.replace(/\.+$/, "").trim();
            return cityNames.has(cleaned.toLowerCase()) || !!lookupCity(cleaned);
          });
          if (hasEarlierCity) {
            trace?.push(`step8: skip — isAdmin with better city candidate earlier`);
            cityIdx--;
            continue;
          }
        }
      }
      if (candidate.length <= 4 && (US_STATES[candidate.toUpperCase()] || isProvinceCode(candidate))) { trace?.push(`step8: skip — short US state/province code`); cityIdx--; continue; }
      if (isPostalCode(candidate)) { trace?.push(`step8: skip — postal code`); cityIdx--; continue; }
      // Allow city-state-country: if candidate is a country name but country is already set
      // and matches (e.g. "Hong Kong, Hong Kong"), treat it as city candidate.
      // Exception: SAR/territories that appear as both country AND city in affiliations
      // e.g. "Hong Kong, China" — "Hong Kong" is a country in our map but also the city.
      if (lookupCountry(candidate) !== null && lookupCountry(candidate) !== country) {
        const isCityToo = cityNames.has(candidate.trim().toLowerCase()) || !!lookupCity(candidate);
        if (!isCityToo) { trace?.push(`step8: skip — is a different country (${lookupCountry(candidate)})`); cityIdx--; continue; }
        // Fall through — treat as city despite being a known country name
      }
      if (matchesKeywords(candidate, DEPT_KEYWORDS)) { trace?.push(`step8: skip — matches dept keywords`); cityIdx--; continue; }

      // Candidate passed guards — try to match as city
      const rawCity = cleanCity(segments[cityIdx], cityNames);
      trace?.push(`step8: cleanCity(${JSON.stringify(segments[cityIdx])}) → ${JSON.stringify(rawCity)}`);
      trace?.push(`step8: cityNames.has(${JSON.stringify(rawCity?.trim().toLowerCase())}) → ${rawCity ? cityNames.has(rawCity.trim().toLowerCase()) : false}`);
      if (rawCity && cityNames.has(rawCity.trim().toLowerCase())) {
        trace?.push(`step8: MATCH via cityNames → city=${JSON.stringify(rawCity)}`);
        city = rawCity;
        segments.splice(cityIdx, 1);
        break;
      }
      const cityInfo = rawCity ? lookupCity(rawCity) : null;
      trace?.push(`step8: lookupCity(${JSON.stringify(rawCity)}) → ${cityInfo ? `{city:${cityInfo.city}, country:${cityInfo.country}}` : "null"}`);
      if (cityInfo) {
        trace?.push(`step8: MATCH via lookupCity → city=${JSON.stringify(cityInfo.city)}`);
        city = cityInfo.city;
        if (!country) country = cityInfo.country;
        segments.splice(cityIdx, 1);
        break;
      }

      // No city match — continue scanning leftward
      trace?.push(`step8: no match, scanning left`);
      cityIdx--;
    }
    if (city === null) trace?.push(`step8: exhausted all candidates → city=null`);
  }

  // Step 8b: Fallback to city from institution-map if step 8 found nothing
  if (city === null && institutionFallbackCity) {
    trace?.push(`step8b: fallback to institution-map city → ${JSON.stringify(institutionFallbackCity)}`);
    city = institutionFallbackCity;
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

  // Step 10b: If city is still null, scan institution name for embedded city tokens
  // e.g. "Shin Sapporo Neurosurgical Hospital" → token "Sapporo" → city = "Sapporo"
  if (!city && institution) {
    const tokens = institution.split(/\s+/);
    for (const token of tokens) {
      const info = lookupCity(token.replace(/\.+$/, "").trim());
      if (info && (!country || info.country === country)) {
        city = info.city;
        break;
      }
    }
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

  // Step 1a: HTML-entity decode (hex entities only — e.g., &#xe5; → å)
  // Must run before any splitting to avoid splitting mid-entity on ";".
  raw = raw.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

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

export type ParsedAffiliationWithTrace = {
  input: string;
  result: ParsedAffiliation | null;
  trace: string[];
};

/**
 * Debug variant of parseAffiliation that returns a trace of key parsing decisions.
 * For diagnostic use only — not called in production paths.
 */
export async function parseAffiliationWithTrace(
  raw: string
): Promise<ParsedAffiliationWithTrace> {
  if (!raw.trim()) {
    return { input: raw, result: null, trace: ["step1: empty input"] };
  }

  // Step 1a: HTML-entity decode (hex entities only — e.g., &#xe5; → å)
  raw = raw.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  const { names: cityNames, countryMap: cityCountryMap } = await getCityCache();

  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();

  const parts = text.split(/\.\s*;\s*|;\s+/).map((p) => p.trim()).filter(Boolean);

  const allTrace: string[] = [`step1: input=${JSON.stringify(raw)}`, `step1: parts after semicolon-split: ${parts.length}`];

  let bestResult: ParsedAffiliation | null = null;
  for (let pi = 0; pi < parts.length; pi++) {
    const partTrace: string[] = [];
    allTrace.push(`--- part ${pi + 1}/${parts.length}: ${JSON.stringify(parts[pi])}`);
    const result = parseSingleSegment(parts[pi], cityNames, cityCountryMap, partTrace);
    allTrace.push(...partTrace);
    allTrace.push(`--- part ${pi + 1} result: ${JSON.stringify(result)}`);
    if (result?.country) {
      return { input: raw, result, trace: allTrace };
    }
    if (!bestResult && result) bestResult = result;
  }
  return { input: raw, result: bestResult, trace: allTrace };
}
