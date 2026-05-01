/**
 * Klasse B affiliation parser — one-to-many address model.
 *
 * A "Klasse B" affiliation is a semicolon-separated multi-address string.
 * Each address is parsed individually via the Klasse A parser and returned
 * as its own AddressRow at a given position.
 *
 * Returns null when:
 * - The string contains no semicolons (not a multi-address string)
 * - Any individual address fails to parse (the whole string stays Klasse C)
 *
 * No country-agreement check — multiple countries are allowed.
 */

import { parseAffiliation } from "./affiliation-parser";

// ── Output type ───────────────────────────────────────────────────────────────

export type AddressRow = {
  position:              number;
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  confidence:            "high" | "low";
};

// ── Pre-processing ────────────────────────────────────────────────────────────

function preProcess(raw: string): string {
  let text = raw.replace(/\s*\([A-Za-z][A-Za-z.\-,\s]{2,}\)\s*\.?\s*$/, "").trim();
  text = text.replace(/\([A-Z]{1,3}(?:,\s*[A-Z]{1,3})+\)/g, "").trim();
  text = text.replace(/\.\s*Electronic\s+address:.*$/i, "").trim();
  text = text.replace(/\s*[-–—;]?\s*[\w.+-]+@[\w.-]+\.\w+\s*\.?$/, "").trim();
  // Strip trailing "; and." — these are Klasse A strings with a hanging conjunction
  text = text.replace(/\s*;\s*and\.?\s*$/i, "").trim();
  // Normalize fused tokens: "Hospital;Dept" → "Hospital; Dept", "BrisbaneQLD" → "Brisbane QLD"
  text = text.replace(/;([^\s])/g, '; $1');
  text = text.replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2');
  return text;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a multi-address affiliation string into one AddressRow per address.
 *
 * Returns null if the string has no semicolons or any part fails to parse.
 */
export async function parseClassB(raw: string | null): Promise<AddressRow[] | null> {
  if (!raw) return null;

  const text = preProcess(raw);

  if (!text.includes(";")) return null;

  // Split on semicolons (same pattern as the Klasse A parser internals)
  const segments = text.split(/\.\s*;\s*|;\s+/).map((s) => s.trim()).filter(Boolean);

  if (segments.length < 2) return null;

  // Parse each segment via Klasse A parser.
  // Each segment has no semicolons, so parseAffiliation treats it as a
  // single address (passes the internal semicolon guard).
  const parsed = await Promise.all(segments.map((seg) => parseAffiliation(seg)));

  // Any null → whole string stays Klasse C
  if (parsed.some((r) => r === null)) return null;

  return (parsed as NonNullable<(typeof parsed)[number]>[]).map((result, i) => ({
    position:              i + 1,
    city:                  result.city,
    state:                 result.state,
    country:               result.country,
    institution:           result.institution,
    institution2:          result.institution2,
    institution3:          result.institution3,
    institutions_overflow: result.institutions_overflow,
    department:            result.department,
    department2:           result.department2,
    department3:           result.department3,
    departments_overflow:  result.departments_overflow,
    confidence:            result.confidence,
  }));
}
