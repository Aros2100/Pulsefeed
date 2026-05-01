/**
 * Lab affiliation parser — 3+3+overflow data model.
 * Rewritten from production parser to capture multi-dept/institution data and
 * add state detection.  No AI, no external APIs — pure string parsing.
 */

import { lookupCountry, CANONICAL_COUNTRIES, US_STATES } from "./country-map";
import { lookupInstitution } from "./institution-map";
import { isAdministrativeRegion, isProvinceCode } from "./region-map";
import { lookupCity } from "./city-map";
import { getCityCache, normalizeCityKey, lookupStateByCity } from "./city-cache";
import { lookupState } from "./state-map";

// ── Output type ───────────────────────────────────────────────────────────────

export type ParsedAffiliation = {
  department: string | null;
  department2: string | null;
  department3: string | null;
  departments_overflow: string[];
  institution: string | null;
  institution2: string | null;
  institution3: string | null;
  institutions_overflow: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  confidence: "high" | "low";
};

// ── Keywords ──────────────────────────────────────────────────────────────────

// Reverse set of US state full names for O(1) lookup (used by isClassA country-repeat guard)
// Prevents "New York", "Missouri" etc. from being counted as standalone country tokens
// when lookupCountry() returns "United States" for US state full names.
const _US_STATE_FULL_NAMES = new Set(Object.values(US_STATES));

// ── Local accent normaliser (mirrors city-cache.ts) ──────────────────────────
function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const DEPT_KEYWORDS = [
  "Department", "Division", "Section", "Unit", "Clinic of",
  "Laboratory", "Lab of",
  // French department prefix ("Service de Neurochirurgie")
  "Service de", "Service d'",
  // German department equivalents
  "Abteilung",           // = Department
  "Sektion",             // = Section
  "Klinik für",          // = ward/clinic for X (dept); does NOT match "Klinikum" (inst)
  "Klinik und Poliklinik", // e.g. "Neurochirurgische Klinik und Poliklinik"
  "Poliklinik",          // outpatient clinic / polyclinic
  "Forschungsgruppe",    // research group
  "Arbeitsgruppe",       // working group
];

const INST_KEYWORDS = [
  "University", "Hospital", "Medical Center", "Medical Centre",
  "School of Medicine", "College of Medicine", "Faculty of Medicine",
  "Academy", "Charité", "Karolinska", "Mayo Clinic",
  "Paracelsus", "Institut", "Institute", "Foundation", "College",
  "Hospices", "Fondazione", "IRCCS", "Kantonsspital", "Universität",
  "Università", "Université", "Universidad", "Universidade",
  "Instituto", "Istituto", "Health System", "Guideline Group",
  "Policlinico", "Klinikum", "Kliniken", "Hôpital", "Hôpitaux",
  "Sjukhus", "Sygehus", "Ziekenhuis", "Krankenhaus", "Red Cross",
  // Italian
  "Ospedale", "Azienda Ospedaliera", "ASST",
  // German
  "Uniklinik", "Universitätsklinikum", "Medizinische Fakultät",
  // French hospital group prefix (GHU = Groupe Hospitalo-Universitaire)
  "GHU",
];

/** Keyword matching with accent normalisation so "Hopital" matches "Hôpital" etc. */
function matchesKeywords(segment: string, keywords: string[]): boolean {
  const lower = unaccent(segment.toLowerCase());
  return keywords.some((kw) => lower.includes(unaccent(kw.toLowerCase())));
}

// Single-token medical specialty words that classify a segment as SUBUNIT
const SPECIALTY_TOKENS = new Set([
  "neurosurgery", "neurology", "radiology", "surgery", "pathology", "cardiology",
  "oncology", "pediatrics", "psychiatry", "anesthesiology", "ophthalmology",
  "orthopedics", "orthopaedics", "urology", "dermatology", "gastroenterology",
  "hematology", "endocrinology", "nephrology", "pulmonology", "rheumatology",
  "immunology", "microbiology", "biochemistry", "genetics", "pharmacology",
  "physiology", "anatomy", "histology", "otolaryngology", "gynecology", "obstetrics",
  "interventional neuroradiology", "interventional radiology", "diagnostic radiology",
  "internal medicine", "family medicine", "emergency medicine", "sports medicine",
  "critical care", "intensive care",
]);

// Words that indicate a parenthesised group is an institution name (→ keep it)
const PAREN_INST_WORDS = [
  "hospital", "university", "center", "centre", "institute", "college",
  "medical", "clinic", "academy", "foundation",
];

/**
 * Returns true only for author-initial / contribution-list parentheses that
 * should be stripped.  Everything else (institution names, acronyms) is kept.
 */
function shouldStripParentheses(content: string): boolean {
  const t = content.trim();
  const lower = t.toLowerCase();

  // Keep if content contains any institution keyword
  if (PAREN_INST_WORDS.some((w) => lower.includes(w))) return false;

  // Strip: comma-separated 1–3 uppercase groups — "(SZ, HY, YL)", "(AB, CD)"
  if (/^[A-Z]{1,3}(?:,\s*[A-Z]{1,3})+$/.test(t)) return true;

  // Strip: dotted initials — "(D.A.L.)", "(J.I.)"
  if (/^[A-Z](?:\.[A-Z])+\.?$/.test(t)) return true;

  // Strip: any content that contains commas but no institution keywords
  // (author name lists like "(Docherty, Shabalin, DiBlasi)")
  if (t.includes(",")) return true;

  // Keep everything else (single names, acronyms, short institution codes)
  return false;
}

/**
 * Returns true when a segment that has no explicit dept/inst keyword should
 * still be treated as a SUBUNIT based on its suffix or content in context.
 */
function isSubunitByContext(seg: string, laterSegs: string[]): boolean {
  const lower = seg.toLowerCase();
  const hasLaterInst = laterSegs.some((s) => matchesKeywords(s, INST_KEYWORDS));

  // " Center" / " Centre" suffix → subunit only when an institution follows
  if (/\b(center|centre)$/i.test(seg) && hasLaterInst) return true;

  // " School of " → subunit when institution follows
  // ("Graduate School of Medical and Dental Sciences" + later University)
  if (/\bschool\s+of\b/i.test(seg) && hasLaterInst) return true;

  // Specialty word (≤ 3 tokens, no geo/keyword match already checked by caller)
  const wordCount = seg.trim().split(/\s+/).length;
  if (wordCount <= 3 && SPECIALTY_TOKENS.has(lower)) return true;

  return false;
}

/**
 * Returns true if a segment is a geographic token (city, state, or country name)
 * that should never be placed in department or institution slots.
 */
function isGeoSegment(seg: string, cityNames: Set<string>): boolean {
  if (cityNames.has(normalizeCityKey(seg))) return true;
  if (lookupCity(seg.replace(/\.+$/, "").trim()) !== null) return true;
  if (lookupCountry(seg.replace(/\.+$/, "").trim()) !== null) return true;
  if (lookupState(seg.replace(/\.+$/, "").trim()) !== null) return true;
  return false;
}

/**
 * Returns true when a segment looks like a street address or address fragment that
 * should never appear in department or institution fields.
 * Used as a guard in both the classification loop and unknown resolution.
 */
function isAddressFragment(segment: string): boolean {
  const s = segment.trim();
  // A1: Room/suite code — digit followed immediately by letters/digits, no spaces
  //     "1R203", "2A14", "3F" — but NOT research-unit IDs like "UMR5287" (starts with letter)
  if (/^\d[A-Z0-9]{1,7}$/.test(s)) return true;
  // Digit-prefix street number: "34 Yamada-cho", "71 Avenue Edouard Vaillant"
  if (/^\d+\s+\S/.test(s)) return true;
  // Postal code + city (no comma): "92100 Boulogne-Billancourt"
  if (/^\d{4,5}\s+[\p{L}]/u.test(s)) return true;
  // Japanese administrative suffixes: -cho, -ku, -shi, -machi, -gun, -mura
  // Catches "Yamada-cho", "Yamashina-ku", "Kyoto-shi", "Kyoto-shi 607-8175"
  if (/-(cho|ku|shi|machi|gun|mura)\b/i.test(s)) return true;
  // A2: Floor/building/room markers — always address regardless of word count.
  //     "Tower" intentionally omitted: it appears in institution names ("Drum Tower Hospital",
  //     "Trump Tower") too often to be a reliable standalone indicator.  Fused cases like
  //     "Tower35233" are caught by Bug C below; "Tower 3" by A3.
  if (/\b(Floor|Fl\.|Building|Bldg\.?|Suite|Room|Wing)\b/i.test(s)) return true;
  // A3: European address format — name(s) + trailing number or range ("Haartmaninkatu 4",
  //     "Straße 1-3", "Strada 12a", "Avenue 5–7").
  //     Exception 1: research-unit-like endings ("[A-Z]{2+} NNN") are NOT addresses.
  //     Exception 2 (R9): segments containing an INST or DEPT keyword are NOT addresses —
  //     protects numbered university names like "Université Lyon 1", "Paris 6 University".
  if (
    s.split(/\s+/).length <= 3 &&
    /\s+\d+([-–]\d+)?[a-z]?$/i.test(s) &&
    !/\b[A-Z]{2,8}\s+\d{2,6}$/.test(s) &&
    !matchesKeywords(s, INST_KEYWORDS) &&
    !matchesKeywords(s, DEPT_KEYWORDS)
  ) return true;
  // Bug A (R8): "No. X" address prefix: "No. 23 Post Street", "No. 20 Chazhong Road"
  if (/^No\.?\s+\d+/i.test(s)) return true;
  // Bug A (R8): number/No. prefix + street keyword (any word count)
  if (
    /^(?:\d+|No\.?\s+\d+)\s/i.test(s) &&
    /\b(Road|Street|Avenue|Boulevard|Lane|Way|Place|Square|Drive|Court|Crescent|Terrace|Mews|Plaza|Strasse|Stra[sß]e|Allee|Weg|Gasse|Platz|Damm)\b/i.test(s)
  ) return true;
  // Bug C (R8): fused alphanumeric+digit codes ("Tower35233", "Faculty Office Tower35233")
  if (/[A-Za-z]+\d{4,5}\b/.test(s) && s.split(/\s+/).length <= 4) return true;
  // Street/road keywords in short (≤ 3 word) segments
  if (s.split(/\s+/).length <= 3) {
    if (/\b(Avenue|Boulevard|Blvd|Street|Road|Lane|Way|Drive|Place|Square|Plaza)\b/i.test(s)) return true;
    if (/\b(Court|Crescent|Terrace|Mews)\b/i.test(s)) return true;
    // German/European street types
    if (/\b(Strasse|Allee|Weg|Gasse|Ufer|Damm|Platz)\b/i.test(s)) return true;
    if (/\bStra[sß]e\b/i.test(s) || /Stra[sß]e/i.test(s)) return true;  // Straße / Strasse
    // "Bank" = street name (but NOT "World Bank" or "Bank of X")
    if (/\bBank\b/i.test(s) && !/\b(World\s+Bank|Bank\s+of)\b/i.test(s)) return true;
  }
  return false;
}

/**
 * Returns true for research-unit identifiers (UMR5287, UMR 7039, INSERM U 1266, etc.).
 * These are research sub-unit codes that belong in the department/subunit slots.
 */
function isResearchUnitId(seg: string): boolean {
  const s = seg.trim();
  // "UMR5287", "UMR 7039", "U1266" — acronym + optional space + digits
  if (/^[A-Z]{1,8}\s?\d{2,6}$/.test(s)) return true;
  // "INSERM U 1266", "CNRS UMR 7039" — acronym + space + acronym + optional space + digits
  if (/^[A-Z]{2,8}\s+[A-Z]{1,3}\s?\d{2,6}$/.test(s)) return true;
  return false;
}

/**
 * Bug B (R8): Returns true for administrative subdivision labels that should never
 * appear in department or institution fields.
 * Examples: "Nangang District", "Haidian District", "Kochi Prefecture"
 */
function isAdministrativeSubDivision(segment: string): boolean {
  const s = segment.trim();
  if (s.split(/\s+/).length > 4) return false;
  if (matchesKeywords(s, INST_KEYWORDS)) return false;
  if (matchesKeywords(s, DEPT_KEYWORDS)) return false;
  return /\b(District|Prefecture|Borough|Township|County|Sub-District)\b\s*\.?$/i.test(s);
}

// ── NOISE detection ───────────────────────────────────────────────────────────

function isPostalCode(segment: string): boolean {
  const s = segment.trim();
  if (/^\d{3,6}$/.test(s)) return true;
  if (/^[A-Z]{1,2}[-\s]?\d{3,6}$/i.test(s)) return true;
  if (/^\d{3,5}\s+[A-Z]{1,3}$/i.test(s)) return true;
  if (/^\d{2,3}-\d{2,4}$/.test(s)) return true;
  if (/^\d+-\d+-\d+\s+\S/.test(s)) return true;
  if (/^\d+\s+.*\b(Ave|St|Rd|Blvd|Dr|Ln|Pl|Ct|Floor|Fl|Str)\b/i.test(s)) return true;
  if (/^CEP\s+[\d\-]+$/i.test(s)) return true;
  if (/^〒\d{3}-\d{4}$/.test(s)) return true;
  if (/^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/.test(s)) return true;
  if (/^[A-Z]{2}\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/.test(s)) return true;
  if (/^[Cc]é?dex\b/i.test(s)) return true;
  return false;
}

function isPhoneNumber(segment: string): boolean {
  return /^[\d\s\-+().]{7,}$/.test(segment.trim());
}

function extractUsStateFromZipSegment(segment: string): string | null {
  const s = segment.trim();
  const match = s.match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/);
  if (!match) return null;
  return US_STATES[match[1]] ? match[1] : null;
}

// ── City helpers ──────────────────────────────────────────────────────────────

const CITY_EXTRACT_BLOCKLIST = new Set([
  "university", "hospital", "institute", "college", "school",
  "center", "centre", "clinic", "academy", "laboratory",
  "medical", "research", "foundation", "faculty", "department",
  "division", "section", "unit", "surgery", "sciences",
  "national", "general", "central", "regional", "memorial",
  "children", "veterans", "military", "naval", "royal",
  "health", "system", "ministry", "guideline", "network",
  "reference", "member", "corporate", "fondazione",
]);

function cleanCity(raw: string, cityNames: Set<string>): string {
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(raw.trim())) return "";
  let city = raw;
  city = city.replace(/^DK[-\s]?\d{0,4}\s*/i, "").trim();
  city = city.replace(/^[A-Z]{2}[-_]\d{4,5}\s+/i, "").trim();
  city = city.replace(/^[A-Z]{1,2}[-\s]?\d{3,6}\s+/i, "").trim();
  city = city.replace(/^\d{2,5}[-\s]+/, "").trim();
  city = city.replace(/^([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s\-]+?)\d{4,6}$/, "$1").trim();
  city = city.replace(/^[A-Z]\d{2}\s+[A-Z0-9]{4}\s+/, "").trim();
  city = city.replace(/^INSERM\s+\d+\s+/i, "").trim();
  city = city.replace(/\s+[A-Z]{1,2}-\d{3,6}$/, "").trim();
  city = city.replace(/\s+\d{5}-\d{3}$/, "").trim();
  city = city.replace(/\s+\d{4}\s+[A-Z]{2}$/, "").trim();
  city = city.replace(/\s+\d{1,3}[-]\d{3,5}$/, "").trim();
  city = city.replace(/\s+\d{4,6}$/, "").trim();
  city = city.replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "").trim();
  city = city.replace(/\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/, "").trim();
  city = city.replace(/\s+[A-Z]\d{2}\s+[A-Z0-9]{4}$/, "").trim();
  city = city.replace(/\s+[Cc]é?dex\b.*$/i, "").trim();
  if (/^[Cc]é?dex\b/i.test(city)) city = "";
  city = city.replace(/\s+\d{4,6}$/, "").trim();
  const withoutSuffix = city.replace(/\s+[A-ZØÖÜÆÅ]$/u, "");
  if (withoutSuffix.length >= 3) city = withoutSuffix;
  const lastSpaceIdx = city.lastIndexOf(" ");
  if (lastSpaceIdx > 2) {
    const maybeState = city.slice(lastSpaceIdx + 1);
    if (lookupCountry(maybeState) === "United States") {
      city = city.slice(0, lastSpaceIdx).trim();
    }
  }
  city = city.replace(/\s+-\s+State\s+of\s+.*$/i, "").trim();
  if (city.endsWith(" City")) {
    const base = city.slice(0, -5).trim();
    if (base && cityNames.has(normalizeCityKey(base)) && !isAdministrativeRegion(base)) {
      city = base;
    }
  }
  city = city.replace(/-City$/i, "").trim();
  if (/\s+City$/i.test(city)) {
    const base = city.replace(/\s+City$/i, "").trim();
    if (!isAdministrativeRegion(base)) city = base;
  }
  city = city.replace(/-si$/i, "").trim();
  city = city.replace(/-gu$/i, "").trim();
  city = city.replace(/-do$/i, "").trim();
  city = city.replace(/[.\s]+$/, "").trim();
  return city;
}

// ── Comma normalizer ──────────────────────────────────────────────────────────

const CANADIAN_PROVINCES: Record<string, string> = {
  "ONT": "Ontario", "BC": "British Columbia", "ALTA": "Alberta",
  "QUE": "Quebec", "MAN": "Manitoba", "SASK": "Saskatchewan",
  "NS": "Nova Scotia", "NB": "New Brunswick", "PEI": "Prince Edward Island",
  "NFLD": "Newfoundland", "NWT": "Northwest Territories", "YT": "Yukon",
};

const BRAZILIAN_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO",
  "MA","MT","MS","MG","PA","PB","PR","PE","PI",
  "RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let _countryCommaRe: RegExp | null = null;
function countryCommaRe(): RegExp {
  if (!_countryCommaRe) {
    const names = [...CANONICAL_COUNTRIES].sort((a, b) => b.length - a.length).map(escapeRegExp);
    names.push("USA", "U\\.S\\.A\\.", "U\\.S\\.");
    // Negative lookbehinds prevent comma insertion when a country name is part of an
    // institution name: "University of Southern Denmark", "University of Western Australia",
    // "Northern Ireland", "West China Hospital", etc.
    _countryCommaRe = new RegExp(
      `(?<!,)(?<! of)(?<!\\bNew )` +
      `(?<!Southern)(?<!Northern)(?<!Western)(?<!Eastern)` +
      `(?<!Central)(?<!Middle)(?<!South)(?<!North)(?<!West)(?<!East)` +
      `\\s+(${names.join("|")})(?=[,.]|$)`,
      "g"
    );
  }
  return _countryCommaRe;
}

let _stateCommaRe: RegExp | null = null;
function stateCommaRe(): RegExp {
  if (!_stateCommaRe) {
    const abbrevs = Object.keys(US_STATES).filter((k) => k.length === 2).map(escapeRegExp);
    const usVariants = "United\\s+States|USA|U\\.S\\.A\\.|U\\.S\\.";
    _stateCommaRe = new RegExp(
      `(?<!,)\\s+(${abbrevs.join("|")})(?=\\s+(?:${usVariants})[,.]?)`, "g"
    );
  }
  return _stateCommaRe;
}

let _brStateCommaRe: RegExp | null = null;
function brStateCommaRe(): RegExp {
  if (!_brStateCommaRe) {
    const abbrevs = BRAZILIAN_STATES.map(escapeRegExp);
    _brStateCommaRe = new RegExp(
      `(?<!,)\\s+(${abbrevs.join("|")})(?=,\\s*Brazil\\b)`, "g"
    );
  }
  return _brStateCommaRe;
}

function normalizeCommas(text: string): string {
  text = text.replace(countryCommaRe(), ", $1");
  text = text.replace(stateCommaRe(), ", $1");
  text = text.replace(brStateCommaRe(), ", $1");
  return text;
}

// ── Class A detector ──────────────────────────────────────────────────────────
// Returns true if the raw string encodes multiple independent addresses.

function isClassA(parts: string[]): boolean {
  // Bug C fix: repeated standalone country token within a single part = multi-address
  // without semicolon (e.g. "…, Lyon, France, INSERM U 864, Bron, France.").
  // Guards:
  //   - Skip US state abbreviations that share ISO country codes (MA=Morocco, PA=Panama…)
  //   - Skip segments containing digits (postal codes, room codes, street numbers)
  for (const part of parts) {
    const segs = part.split(/,\s*/).map((s) => s.replace(/\.+$/, "").trim()).filter(Boolean);
    const countryHits = segs.filter((s) => {
      if (/^[A-Z]{2}$/.test(s) && US_STATES[s]) return false; // 2-letter abbrev (MA=Morocco, PA=Panama…)
      if (/\d/.test(s)) return false;                          // postal codes / addresses
      if (_US_STATE_FULL_NAMES.has(s)) return false;           // full state name (New York, Missouri…)
      return lookupCountry(s) !== null;
    }).length;
    if (countryHits > 1) return true;
  }

  if (parts.length <= 1) return false;

  // Collect distinct countries across parts
  const countries = new Set<string>();
  const stateKeys = new Set<string>();
  for (const part of parts) {
    const segs = part.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segs) {
      const c = lookupCountry(seg.replace(/\.+$/, "").trim());
      if (c) countries.add(c);
      // Also check non-US state tokens
      const st = lookupState(seg.replace(/\.+$/, "").trim());
      if (st) stateKeys.add(`${st.state}::${st.country}`);
    }
  }

  if (countries.size > 1) return true;

  // If multiple segments each independently contain an institution indicator AND
  // a city or country indicator → treat as multi-address
  let independentAddressCount = 0;
  for (const part of parts) {
    const hasInst = matchesKeywords(part, INST_KEYWORDS);
    const segs = part.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    const hasGeo = segs.some((s) => lookupCountry(s.replace(/\.+$/, "").trim()) !== null);
    if (hasInst && hasGeo) independentAddressCount++;
  }
  return independentAddressCount >= 2;
}

// ── Core single-address parser ────────────────────────────────────────────────

function parseSingleAddress(
  rawText: string,
  cityNames: Set<string>,
  cityCountryMap: Map<string, string>,
  trace?: string[]
): ParsedAffiliation | null {
  let text = rawText;

  // Pre-processing
  text = text.replace(/\bthe\s+(Netherlands|Philippines|Czech Republic|United Arab Emirates|United Kingdom|Gambia|Bahamas|Maldives|Comoros|Seychelles)\b/gi, "$1");
  text = normalizeCommas(text);
  // Bug D (R8): remove comma inserted before prepositions that are part of institution names,
  // e.g. "Karl-August-Bushe-Archiv, für Geschichte..." → "Karl-August-Bushe-Archiv für Geschichte..."
  text = text.replace(/,\s+(für|del|dei|delle|da)\b/gi, ' $1');
  // Split run-on country+institution patterns: "Germany Laboratory..." → "Germany; Laboratory..."
  // Guard: only split when the country token opens a comma-segment (start of text or
  // immediately after a comma). This prevents splitting compound institution names such
  // as "West China Hospital" or "North China Medical" where the country word is a
  // mid-phrase token, not a sentence/segment boundary.
  text = text.replace(
    new RegExp(`(?:^|(?<=,\\s*))(${CANONICAL_COUNTRIES.map(escapeRegExp).join("|")})\\s+(?!City\\b)(?=[A-Z])`, "g"),
    "$1; "
  );
  text = text.replace(/\.\s*Electronic address:.*$/i, "").trim();
  text = text.replace(/Electronic address:.*$/i, "").trim();
  // Bug-3 fix: strip email with optional dash-separator "USA - user@host.edu."
  text = text.replace(/\s*[-–—]?\s*[\w.+-]+@[\w.-]+\.\w+\s*\.?$/, "").trim();
  text = text.replace(/\s*[\w.-]+\.(ac|edu|org|com|gov|net)\.[a-z]{2,4}\s*$/i, "").trim();
  text = text.replace(/^\d+\s*([A-Z])/, "$1");
  text = text.replace(/^([a-z])\s+([A-Z])/, "$2");
  text = text.replace(/^From\s+the\s+/i, "").replace(/^From\s+/i, "").trim();
  text = text.replace(/[.\s]+$/, "").trim();
  if (!text) return null;

  // Bug-4 fix: only strip author-initial parens, keep institution names in parens
  text = text.replace(/\s*\(([A-Za-z][^)]*)\)/g, (match, content) =>
    shouldStripParentheses(content) ? "" : match
  ).trim();
  if (!text) return null;

  // Reject fragment-only strings
  if (/^(Departments?|Divisions?|Sections?|Units?|Clinics?)\s+of\s*/i.test(text) && !text.includes(",")) return null;
  if (text.length > 350) return null;
  if (/^and\s+/i.test(text)) return null;
  if (/contributed equally/i.test(text)) return null;
  if (/^[A-Z]\.\s?[A-Z]\.?$/.test(text.trim())) return null;
  if (/^(Full|Corporate)\s+Member\s+of\b/i.test(text)) return null;
  if (/^Ministry\s+of\b/i.test(text) && !text.includes(",")) return null;
  if (/^Republic\s+of\b/i.test(text) && !text.includes(",")) return null;
  if (/^P\.\s*R\.?$/i.test(text.trim())) return null;

  // Split into segments
  const segments = text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  trace?.push(`split: [${segments.map((s) => JSON.stringify(s)).join(", ")}]`);
  if (segments.length === 0) return null;

  // Remove NOISE segments
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (isPostalCode(seg)) {
      const preserved = extractUsStateFromZipSegment(seg);
      if (preserved) segments[i] = preserved;
      else segments.splice(i, 1);
    } else if (isPhoneNumber(seg)) {
      segments.splice(i, 1);
    } else {
      // Cedex format: "83800 Toulon Cedex 9" or "Toulon Cedex 9" → "Toulon"
      // Must be checked before the generic zipCountryMatch so the city name is
      // extracted cleanly (not left as "Toulon Cedex 9" which city-lookup may miss).
      const cedexMatch = seg.match(
        /^(?:\d{3,6}\s+)?([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\-'\s]+?)\s+[Cc]é?dex\b.*$/i
      );
      if (cedexMatch) {
        segments[i] = cedexMatch[1].trim();
        // Also strip any preceding street segments that belong to the same
        // address block: a street name (isAddressFragment) and/or a bare
        // street number (/^\d+$/) immediately before the Cedex segment.
        // e.g. "2, boulevard Sainte-Anne, 83800 Toulon Cedex 9"
        //       → remove "boulevard Sainte-Anne" (address fragment)
        //       → remove "2" (bare street number)
        const toRemove: number[] = [];
        let check = i - 1;
        if (check >= 0 && isAddressFragment(segments[check])) {
          toRemove.push(check--);
        }
        if (check >= 0 && /^\d+$/.test(segments[check])) {
          toRemove.push(check);
        }
        // Splice highest index first to preserve lower indices
        for (const idx of toRemove.sort((a, b) => b - a)) {
          segments.splice(idx, 1);
        }
      } else {
        const zipCountryMatch = seg.match(/^(\d{3,6})\s+(.+)$/);
        if (zipCountryMatch) segments[i] = zipCountryMatch[2].trim();
      }
    }
  }

  // Strip author-name parentheses (Bug-4: keep institution names in parens)
  for (let i = 0; i < segments.length; i++) {
    segments[i] = segments[i].replace(/\s*\(([A-Za-z][^)]*)\)\s*/g, (match, content) =>
      shouldStripParentheses(content) ? "" : match
    ).trim();
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i] || (segments[i].includes(")") && !segments[i].includes("("))) {
      segments.splice(i, 1);
    }
  }
  if (segments.length === 0) return null;

  // Bug 4 fix: strip conjunction/article prefixes from segment starts.
  // "and the Shanghai Key Laboratory..." → "Shanghai Key Laboratory..."
  // "the International Co-laboratory..."  → "International Co-laboratory..."
  // "and National Institute..."           → "National Institute..."
  // Capital "The Foo Hospital" is intentionally preserved (no /i on the plain "the" strip).
  for (let i = 0; i < segments.length; i++) {
    segments[i] = segments[i]
      .replace(/^and\s+the\s+/i, "")   // "and the ..."
      .replace(/^the\s+/, "")           // lowercase "the ..." only
      .replace(/^and\s+(?=[A-Z])/, "")  // "and NationalInstitute..." (no "the")
      .trim();
  }

  // ── Step 1: Extract country from last segment ─────────────────────────────

  let country: string | null = null;
  let isUS = false;
  let confidence: "high" | "low" = "high";
  // Bug-2 fix: when a US state name is the last segment (no explicit "USA"),
  // capture it here so Step 2 can set state even without a following state token.
  let stateFromStep1: string | null = null;

  {
    let lastSeg = segments[segments.length - 1].replace(/\.+$/, "").trim();
    lastSeg = lastSeg.replace(/\s+and\s+.*$/i, "").trim();
    const upperLast = lastSeg.toUpperCase();
    const depuncted = lastSeg.replace(/\./g, "").toUpperCase();
    const unaccented = lastSeg.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const directMatch = lookupCountry(lastSeg) ?? (unaccented !== lastSeg ? lookupCountry(unaccented) : null);

    if (US_STATES[upperLast]) {
      country = "United States"; isUS = true;
      stateFromStep1 = US_STATES[upperLast];   // e.g. "FL" → "Florida"
      segments.pop();
    } else if (US_STATES[depuncted] && depuncted !== upperLast) {
      country = "United States"; isUS = true;
      stateFromStep1 = US_STATES[depuncted];
      segments.pop();
    } else if (CANADIAN_PROVINCES[depuncted]) {
      country = "Canada"; segments.pop();
    } else if (directMatch) {
      country = directMatch;
      if (country === "United States") isUS = true;
      segments.pop();
    } else {
      const cityMatch = lookupCity(lastSeg);
      if (cityMatch) {
        country = cityMatch.country;
        if (country === "United States") isUS = true;
        segments.pop();
        // city captured later
      } else {
        const lowerLast = lastSeg.toLowerCase();
        const found = CANONICAL_COUNTRIES.find((c) => lowerLast.includes(c.toLowerCase()));
        if (found) {
          country = found;
          if (found === "United States") isUS = true;
          const idx = lowerLast.lastIndexOf(found.toLowerCase());
          const before = lastSeg.slice(0, idx).trim();
          segments.pop();
          if (before) segments.push(before);
        } else {
          confidence = "low";
        }
      }
    }
  }

  // ── Step 2: Extract state from next-to-last segment ───────────────────────

  let state: string | null = null;

  if (segments.length > 0) {
    const maybeSt = segments[segments.length - 1].replace(/\.+$/, "").trim();
    const maybeStUpper = maybeSt.toUpperCase();

    if (isUS) {
      if (US_STATES[maybeStUpper]) {
        const isAlsoCity = cityNames.has(normalizeCityKey(maybeSt)) || !!lookupCity(maybeSt);
        if (isAlsoCity) {
          const hasAltCity = segments.slice(0, -1).some((s) => {
            const c = s.replace(/\.+$/, "").trim();
            return cityNames.has(normalizeCityKey(c)) || !!lookupCity(c);
          });
          if (hasAltCity) { state = US_STATES[maybeStUpper]; segments.pop(); }
        } else {
          state = US_STATES[maybeStUpper]; segments.pop();
        }
      } else if (lookupCountry(maybeSt) === "United States" && segments.length > 1) {
        // Full US state name (e.g. "New York" — only consume if another segment exists for city)
        state = maybeSt; segments.pop();
      }
    } else if (country) {
      const stateEntry = lookupState(maybeSt, country);
      if (stateEntry) {
        state = stateEntry.state; segments.pop();
      }
    }
  }

  // Bug-2 fix: if state still null but Step 1 captured a state (e.g. "Tampa, Florida." with no USA)
  if (!state && stateFromStep1) {
    state = stateFromStep1;
  }

  // Strip short punctuated codes (e.g. "D.C.")
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].replace(/\.+$/, "").trim();
    if (seg.length <= 4 && /^[A-Z.]+$/i.test(seg) && seg.includes(".")) {
      segments.splice(i, 1);
    }
  }

  // Bug 2b fix: drop Italian province codes (RM, MI, UD …) when country=Italy
  if (country === "Italy") {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^[A-Z]{2}$/.test(segments[i]) && ITALIAN_PROVINCE_CODES.has(segments[i])) {
        segments.splice(i, 1);
      }
    }
  }

  // ── Step 3: Extract city ──────────────────────────────────────────────────

  let city: string | null = null;

  // Try institution-map early for city fallback
  let institutionFallbackCity: string | null = null;
  for (let i = segments.length - 1; i >= Math.max(0, segments.length - 2); i--) {
    const instInfo = lookupInstitution(segments[i]);
    if (instInfo && !institutionFallbackCity) {
      institutionFallbackCity = instInfo.city;
      if (!country) country = instInfo.country;
    }
  }

  // Scan right-to-left for city
  let cityIdx = segments.length - 1;
  while (cityIdx >= 0) {
    const candidate = segments[cityIdx].replace(/\.+$/, "").trim();
    const isAdmin = isAdministrativeRegion(candidate);

    if (isAdmin) {
      const adminIsCity = cityNames.has(normalizeCityKey(candidate)) || !!lookupCity(candidate);
      if (!adminIsCity) { cityIdx--; continue; }
      const hasEarlierCity = segments.slice(0, cityIdx).some((s) => {
        const c = s.replace(/\.+$/, "").trim();
        return cityNames.has(normalizeCityKey(c)) || !!lookupCity(c);
      });
      if (hasEarlierCity) { cityIdx--; continue; }
    }
    if (candidate.length <= 4 && (US_STATES[candidate.toUpperCase()] || isProvinceCode(candidate))) { cityIdx--; continue; }
    if (isPostalCode(candidate)) { cityIdx--; continue; }
    if (lookupCountry(candidate) !== null && lookupCountry(candidate) !== country) {
      const isCityToo = cityNames.has(normalizeCityKey(candidate)) || !!lookupCity(candidate);
      if (!isCityToo) { cityIdx--; continue; }
    }
    if (matchesKeywords(candidate, DEPT_KEYWORDS)) { cityIdx--; continue; }

    const rawCity = cleanCity(segments[cityIdx], cityNames);
    // Bug 3 fix: skip if cleanCity stripped a postal code to reveal an admin region
    // e.g. "Fujian 361102" → cleaned to "Fujian" which is a province, not a city.
    if (rawCity && rawCity !== candidate && isAdministrativeRegion(rawCity)) {
      cityIdx--; continue;
    }
    if (rawCity && cityNames.has(normalizeCityKey(rawCity))) {
      city = rawCity; segments.splice(cityIdx, 1); break;
    }
    const cityInfo = rawCity ? lookupCity(rawCity) : null;
    if (cityInfo) {
      city = cityInfo.city;
      if (!country) country = cityInfo.country;
      segments.splice(cityIdx, 1); break;
    }
    cityIdx--;
  }

  if (city === null && institutionFallbackCity) {
    city = institutionFallbackCity;
  }

  // Bug 1 fix (Round 5): remove trailing address-fragment chains.
  // Once the first TRUE address fragment (not a research-unit ID) is encountered,
  // every subsequent segment with no DEPT/INST keyword that is ≤ 3 words is also
  // treated as address (e.g. "Oyake" sandwiched between "34 Yamada-cho" and "Yamashina-ku").
  {
    const firstAddrIdx = segments.findIndex(
      (s) => isAddressFragment(s) && !isResearchUnitId(s)
    );
    if (firstAddrIdx >= 0) {
      for (let i = segments.length - 1; i >= firstAddrIdx; i--) {
        const seg = segments[i];
        if (
          !isResearchUnitId(seg) && // never remove research-unit IDs (UMR5287, UR 1901 …)
          (
            isAddressFragment(seg) ||
            (
              !matchesKeywords(seg, DEPT_KEYWORDS) &&
              !matchesKeywords(seg, INST_KEYWORDS) &&
              seg.split(/\s+/).length <= 3
            )
          )
        ) {
          segments.splice(i, 1);
        }
      }
    }
  }

  // ── Step 4: Classify remaining segments as SUBUNIT or INSTITUTION ─────────

  const subunits: string[] = [];
  const institutions: string[] = [];
  const unknowns: string[] = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const laterSegs = segments.slice(si + 1);
    const isDept = matchesKeywords(seg, DEPT_KEYWORDS);
    const isInst = matchesKeywords(seg, INST_KEYWORDS);

    if (isDept && isInst) {
      // Context Rule A: "University School of Medicine" in same segment,
      // while another University segment exists → reclassify as SUBUNIT
      const hasSchoolOfMed = /\bschool\s+of\s+medicine\b/i.test(seg);
      const hasUniversity = /\buniversity\b/i.test(seg);
      if (hasSchoolOfMed && hasUniversity) {
        const otherUnivSegs = segments.filter(
          (s) => s !== seg && /\buniversity\b/i.test(s) && !/\bschool\s+of\s+medicine\b/i.test(s)
        );
        if (otherUnivSegs.length > 0) {
          subunits.push(seg);
        } else {
          institutions.push(seg);
        }
      } else {
        institutions.push(seg);
      }
    } else if (isInst) {
      institutions.push(seg);
    } else if (isDept) {
      subunits.push(seg);
    } else if (isSubunitByContext(seg, laterSegs)) {
      // Bug-1 fix: detect subunits by suffix/specialty context
      subunits.push(seg);
    } else if (isResearchUnitId(seg)) {
      // Research unit IDs (UMR5287, UMR 7039, etc.) belong in subunit/dept slots
      subunits.push(seg);
    } else if (isAddressFragment(seg)) {
      // address/street fragment — discard entirely (pre-pass should have caught these,
      // but this is a safety net for fragments that slipped through)
    } else {
      unknowns.push(seg);
    }
  }

  // Resolve unknowns: first fills institution slot, then department
  // Skip geo-tokens, address fragments, administrative subdivisions, and overflow the rest to institutions.
  for (const u of unknowns) {
    if (isGeoSegment(u, cityNames)) continue;
    if (isAddressFragment(u)) continue;
    if (isAdministrativeSubDivision(u)) continue; // Bug B (R8): drop "Nangang District" etc.
    // Fix 3 (R10): probable-city skip — short keywordless unknowns when both state AND country
    // are known from segment extraction (not geo_cities enrichment).  Prevents unrecognised city
    // names (e.g. "Sagamu", "Ilorin") from polluting institution fields.
    // Guards:
    //   - state && country: full local geo context; if either is null, skip is disabled.
    //   - institutions.length > 0: never empty the institution list.
    //   - ≤ 3 words: realistic city-name length.
    //   - No INST/DEPT keyword and not a research-unit ID.
    if (
      state !== null && country !== null &&
      institutions.length > 0 &&
      u.split(/\s+/).length <= 3 &&
      !matchesKeywords(u, INST_KEYWORDS) &&
      !matchesKeywords(u, DEPT_KEYWORDS) &&
      !isResearchUnitId(u)
    ) continue;
    if (institutions.length === 0) institutions.push(u);
    else if (subunits.length === 0) subunits.push(u);
    else institutions.push(u); // overflow to institutions instead of dropping
  }

  // If only subunits, promote first to institution
  if (institutions.length === 0 && subunits.length > 0) {
    institutions.push(subunits.shift()!);
  }

  // Bug-3 hard guard: a bare 2-letter US state abbreviation must never end up as a department.
  if (isUS && !state) {
    for (let i = subunits.length - 1; i >= 0; i--) {
      const s = subunits[i].trim();
      if (s.length === 2 && /^[A-Z]{2}$/.test(s) && US_STATES[s]) {
        state = US_STATES[s];
        subunits.splice(i, 1);
      }
    }
  }

  // ── Step 5: State enrichment from institution token scan ──────────────────
  // Handles embedded state names like "Xinjiang Medical University" → state=Xinjiang

  if (!state && country) {
    outer: for (const inst of institutions) {
      const tokens = inst.split(/\s+/);
      for (const token of tokens) {
        const cleaned = token.replace(/[,.\-()]/g, "").trim();
        if (cleaned.length < 3) continue;
        const entry = lookupState(cleaned, country);
        if (entry) {
          state = entry.state;
          break outer;
        }
        // Also try 2-word tokens
      }
    }
  }

  // ── Step 6: City fallback from institution token scan ─────────────────────

  if (!city) {
    outer: for (const inst of institutions) {
      const tokens = inst.split(/\s+/);
      for (const token of tokens) {
        const info = lookupCity(token.replace(/\.+$/, "").trim());
        if (info && (!country || info.country === country)) {
          city = info.city;
          break outer;
        }
      }
    }
  }

  // ── Step 7: City-to-country fallback ─────────────────────────────────────

  if (city && !country) {
    const cityInfo = lookupCity(city);
    if (cityInfo) {
      country = cityInfo.country;
    } else {
      const fallback = cityCountryMap.get(normalizeCityKey(city));
      if (fallback) country = fallback;
    }
  }

  // ── Step 8: Confidence ────────────────────────────────────────────────────

  const hasParts =
    (country ? 1 : 0) + (city ? 1 : 0) +
    (institutions.length > 0 ? 1 : 0) + (subunits.length > 0 ? 1 : 0);

  if (country && lookupCountry(country) && city && hasParts >= 3) {
    if (confidence !== "low") confidence = "high";
  } else {
    confidence = "low";
  }

  // ── Step 9: Build 3+3+overflow result ────────────────────────────────────

  const [dept1 = null, dept2 = null, dept3 = null, ...deptRest] = subunits;
  const [inst1 = null, inst2 = null, inst3 = null, ...instRest] = institutions;

  return {
    department: dept1,
    department2: dept2,
    department3: dept3,
    departments_overflow: deptRest,
    institution: inst1,
    institution2: inst2,
    institution3: inst3,
    institutions_overflow: instRest,
    city,
    state,
    country,
    confidence,
  };
}

// ── Italian province codes ────────────────────────────────────────────────────
// Bare 2-letter Italian province abbreviations (RM, MI, UD …) are noise when
// country=Italy.  They appear in affiliations like "IRCCS ..., Udine, UD, Italy."
const ITALIAN_PROVINCE_CODES = new Set([
  "AG","AL","AN","AO","AP","AR","AT","AV",
  "BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ",
  "CA","CB","CE","CH","CI","CL","CN","CO","CR","CS","CT","CZ",
  "EN",
  "FC","FE","FG","FI","FM","FR",
  "GE","GO","GR",
  "IM","IS",
  "KR",
  "LC","LE","LI","LO","LT","LU",
  "MB","MC","ME","MI","MN","MO","MS","MT",
  "NA","NO","NU",
  "OG","OR","OT",
  "PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ",
  "RA","RC","RE","RG","RI","RM","RN","RO",
  "SA","SI","SO","SP","SR","SS","SV",
  "TA","TE","TN","TO","TP","TR","TS","TV",
  "UD",
  "VA","VB","VC","VE","VI","VR","VS","VT","VV",
]);

// ── Bug 5: city-state names ───────────────────────────────────────────────────
// Cities that are also their own administrative region (state = city name).
// When state is set but city is null, copy state → city.

const CITY_STATE_NAMES = new Set([
  "Delhi", "Singapore", "Beijing", "Shanghai", "Tianjin", "Chongqing",
  "Tokyo", "Hong Kong", "Macau", "Mexico City", "Riga", "Luxembourg",
  "Monaco", "Vatican City", "Kuwait City", "Panama City",
  // Canadian provinces that double as city names
  "Quebec",
]);

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseAffiliation(raw: string | null): Promise<ParsedAffiliation | null> {
  if (!raw || !raw.trim()) return null;

  // HTML-entity decode
  raw = raw.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
  });

  const { names: cityNames, countryMap: cityCountryMap } = await getCityCache();

  // Strip trailing author initials
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();
  // Strip inline contribution lists: "(SZ, HY, YL)"
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();

  // Strip trailing Electronic address / email before semicolon check — some emails
  // are preceded by a dash or semicolon separator ("USA - user@host.edu",
  // "; user@host.edu") which would otherwise trigger the multi-address guard below.
  text = text.replace(/\.\s*Electronic\s+address:.*$/i, "").trim();
  text = text.replace(/\s*[-–—;]?\s*[\w.+-]+@[\w.-]+\.\w+\s*\.?$/, "").trim();

  // Klasse A/C rule: any remaining semicolon = multi-address string → reject.
  if (text.includes(";")) return null;

  // Split on semicolons (retained for the trace variant; never fires after check above)
  const parts = text.split(/\.\s*;\s*|;\s+/).map((p) => p.trim()).filter(Boolean);

  // Class A detection: multiple independent addresses → return null
  if (isClassA(parts)) return null;

  // Try each part; return first with a country, fallback to first non-null
  let bestResult: ParsedAffiliation | null = null;
  for (const part of parts) {
    const result = parseSingleAddress(part, cityNames, cityCountryMap);
    if (result?.country) {
      // Global state enrichment via geo_cities: runs when city is known but state is not
      if (!result.state && result.city) {
        const enriched = await lookupStateByCity(result.city, result.country ?? undefined);
        if (enriched) result.state = enriched;
      }
      // Bug 5 fix: if state is a city-state name and city is null, copy state → city
      if (!result.city && result.state && CITY_STATE_NAMES.has(result.state)) {
        result.city = result.state;
      }
      return result;
    }
    if (!bestResult && result) bestResult = result;
  }
  // Enrich bestResult too if it has city but no state
  if (bestResult && !bestResult.state && bestResult.city) {
    const enriched = await lookupStateByCity(bestResult.city, bestResult.country ?? undefined);
    if (enriched) bestResult.state = enriched;
  }
  // Bug 5 fix: city-state names fallback
  if (bestResult && !bestResult.city && bestResult.state && CITY_STATE_NAMES.has(bestResult.state)) {
    bestResult.city = bestResult.state;
  }
  return bestResult;
}

// ── Trace variant ─────────────────────────────────────────────────────────────

export type ParsedAffiliationWithTrace = {
  input: string;
  result: ParsedAffiliation | null;
  trace: string[];
};

export async function parseAffiliationWithTrace(
  raw: string
): Promise<ParsedAffiliationWithTrace> {
  if (!raw.trim()) {
    return { input: raw, result: null, trace: ["step1: empty input"] };
  }

  raw = raw.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
  });

  const { names: cityNames, countryMap: cityCountryMap } = await getCityCache();

  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();
  text = text.replace(/\.\s*Electronic\s+address:.*$/i, "").trim();
  text = text.replace(/\s*[-–—;]?\s*[\w.+-]+@[\w.-]+\.\w+\s*\.?$/, "").trim();

  const allTrace: string[] = [
    `input=${JSON.stringify(raw)}`,
  ];

  if (text.includes(";")) {
    allTrace.push("KlasseC: semicolon detected → returning null");
    return { input: raw, result: null, trace: allTrace };
  }

  const parts = text.split(/\.\s*;\s*|;\s+/).map((p) => p.trim()).filter(Boolean);
  allTrace.push(`parts after semicolon-split: ${parts.length}`);

  if (isClassA(parts)) {
    allTrace.push("ClassA: multi-address string detected → returning null");
    return { input: raw, result: null, trace: allTrace };
  }

  let bestResult: ParsedAffiliation | null = null;
  for (let pi = 0; pi < parts.length; pi++) {
    const partTrace: string[] = [];
    allTrace.push(`--- part ${pi + 1}/${parts.length}: ${JSON.stringify(parts[pi])}`);
    const result = parseSingleAddress(parts[pi], cityNames, cityCountryMap, partTrace);
    allTrace.push(...partTrace);
    if (result?.country) {
      if (!result.state && result.city) {
        const enriched = await lookupStateByCity(result.city, result.country ?? undefined);
        if (enriched) {
          result.state = enriched;
          allTrace.push(`state-enrichment: ${result.city} → ${enriched}`);
        }
      }
      if (!result.city && result.state && CITY_STATE_NAMES.has(result.state)) {
        result.city = result.state;
        allTrace.push(`city-state-copy: state=${result.state} → city`);
      }
      allTrace.push(`--- part ${pi + 1} result: ${JSON.stringify(result)}`);
      return { input: raw, result, trace: allTrace };
    }
    allTrace.push(`--- part ${pi + 1} result: ${JSON.stringify(result)}`);
    if (!bestResult && result) bestResult = result;
  }
  if (bestResult && !bestResult.state && bestResult.city) {
    const enriched = await lookupStateByCity(bestResult.city, bestResult.country ?? undefined);
    if (enriched) {
      bestResult.state = enriched;
      allTrace.push(`state-enrichment (bestResult): ${bestResult.city} → ${enriched}`);
    }
  }
  if (bestResult && !bestResult.city && bestResult.state && CITY_STATE_NAMES.has(bestResult.state)) {
    bestResult.city = bestResult.state;
    allTrace.push(`city-state-copy (bestResult): state=${bestResult.state} → city`);
  }
  return { input: raw, result: bestResult, trace: allTrace };
}
