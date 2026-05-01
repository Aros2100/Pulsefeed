/**
 * Klasse B affiliation parser.
 *
 * A "Klasse B" affiliation is a multi-address string where ALL addresses share
 * the same country. The Klasse A parser rejects these (returns null) because
 * it only handles a single address. This parser splits on semicolons, runs the
 * Klasse A parser on each part, and produces a merged result when all parts
 * agree on country.
 *
 * Uses the lab Klasse A parser (../parser/affiliation-parser) directly — no
 * AI, no external APIs.
 */

import { parseAffiliation, type ParsedAffiliation } from "../parser/affiliation-parser";

// ── Output type ───────────────────────────────────────────────────────────────

export type ParsedAffiliationB = {
  /** Always "B" when this parser returns a result */
  geo_class: "B";
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  confidence:            "high" | "low";
  /** How many semicolon-split parts were successfully parsed */
  parts_parsed:          number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove duplicate strings, preserving order of first occurrence. */
function deduplicatePreservingOrder(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    const key = item.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Assign an ordered list of strings to the three named slots + overflow array.
 * Returns { slot1, slot2, slot3, overflow }.
 */
function assignSlots(items: string[]): {
  slot1: string | null;
  slot2: string | null;
  slot3: string | null;
  overflow: string[];
} {
  return {
    slot1:    items[0] ?? null,
    slot2:    items[1] ?? null,
    slot3:    items[2] ?? null,
    overflow: items.length > 3 ? items.slice(3) : [],
  };
}

/**
 * Collect all non-null values from a field across the parsed parts,
 * flatten, deduplicate, and return the ordered unique list.
 */
function mergeField(
  parts: ParsedAffiliation[],
  field: keyof Pick<
    ParsedAffiliation,
    | "institution" | "institution2" | "institution3" | "institutions_overflow"
    | "department" | "department2" | "department3" | "departments_overflow"
  >
): string[] {
  const raw: string[] = [];
  for (const p of parts) {
    const val = p[field];
    if (Array.isArray(val)) {
      for (const v of val) if (v) raw.push(v);
    } else if (val) {
      raw.push(val);
    }
  }
  return deduplicatePreservingOrder(raw);
}

// ── Pre-processing (mirrors affiliation-parser.ts lines 963-972) ─────────────

function preProcess(raw: string): string {
  // Strip trailing author initials
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();
  // Strip inline contribution lists: "(SZ, HY, YL)"
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();
  // Strip Electronic address / email
  text = text.replace(/\.\s*Electronic\s+address:.*$/i, "").trim();
  text = text.replace(/\s*[-–—;]?\s*[\w.+-]+@[\w.-]+\.\w+\s*\.?$/, "").trim();
  return text;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a multi-address affiliation string as Klasse B.
 *
 * Returns null when:
 * - The string contains no semicolons (not a multi-address string)
 * - Any individual part fails to parse (parseAffiliation returns null)
 * - The parsed parts do not share a common country
 *
 * Returns a merged ParsedAffiliationB when all parts parse successfully and
 * agree on country.
 */
export async function parseClassB(raw: string): Promise<ParsedAffiliationB | null> {
  const text = preProcess(raw);

  // Must contain a semicolon to be a multi-address string
  if (!text.includes(";")) return null;

  // Split on semicolons (same pattern used inside affiliation-parser.ts)
  const segments = text.split(/\.\s*;\s*|;\s+/).map((p) => p.trim()).filter(Boolean);

  if (segments.length < 2) return null;

  // Parse each segment individually.
  // parseAffiliation internally strips emails and rejects strings that still
  // contain semicolons, so each clean segment parses as Klasse A-or-null.
  const parsed: (ParsedAffiliation | null)[] = await Promise.all(
    segments.map((seg) => parseAffiliation(seg))
  );

  // Reject if any segment fails to parse
  if (parsed.some((r) => r === null)) return null;

  const results = parsed as ParsedAffiliation[];

  // Collect non-null countries
  const countries = results.map((r) => r.country).filter((c): c is string => c !== null);

  // Require at least one identified country
  if (countries.length === 0) return null;

  // All identified countries must agree (case-insensitive)
  const normalised = countries.map((c) => c.toLowerCase());
  const uniqueCountries = new Set(normalised);
  if (uniqueCountries.size > 1) return null;

  // Merge institutions (deduplicated)
  const allInstitutions = mergeField(results, "institution")
    .concat(mergeField(results, "institution2"))
    .concat(mergeField(results, "institution3"))
    .concat(mergeField(results, "institutions_overflow"));
  const dedupedInstitutions = deduplicatePreservingOrder(allInstitutions);
  const instSlots = assignSlots(dedupedInstitutions);

  // Merge departments (deduplicated)
  const allDepartments = mergeField(results, "department")
    .concat(mergeField(results, "department2"))
    .concat(mergeField(results, "department3"))
    .concat(mergeField(results, "departments_overflow"));
  const dedupedDepartments = deduplicatePreservingOrder(allDepartments);
  const deptSlots = assignSlots(dedupedDepartments);

  // city / state: first non-null across parts
  const city  = results.find((r) => r.city)?.city   ?? null;
  const state = results.find((r) => r.state)?.state ?? null;

  // confidence: "high" only if ALL parts are high
  const confidence: "high" | "low" = results.every((r) => r.confidence === "high") ? "high" : "low";

  return {
    geo_class:             "B",
    department:            deptSlots.slot1,
    department2:           deptSlots.slot2,
    department3:           deptSlots.slot3,
    departments_overflow:  deptSlots.overflow,
    institution:           instSlots.slot1,
    institution2:          instSlots.slot2,
    institution3:          instSlots.slot3,
    institutions_overflow: instSlots.overflow,
    city,
    state,
    country:               countries[0],
    confidence,
    parts_parsed:          results.length,
  };
}
