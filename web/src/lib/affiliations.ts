export interface ParsedAffiliation {
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
}

const HOSPITAL_RE = /hospital|clinic|center|centre|medical\s+cent|health\s+system|healthcare/i;
const DEPT_RE     = /\b(department|dept|division|section|unit|institute|faculty|school\s+of|college\s+of)\b/i;
const ZIP_RE      = /^\d[\d\s\-]{2,}$/;

/**
 * Parses structured fields from a raw affiliations array using
 * regex / string heuristics — no external API calls.
 */
export function parseAffiliation(
  affiliations: string[] | null
): ParsedAffiliation {
  const raw = affiliations?.find((a) => a.trim().length > 0);
  if (!raw) return { department: null, hospital: null, city: null, country: null };

  // Strip leading numbers / whitespace PubMed sometimes prepends (e.g. "1 Dept of…")
  const cleaned = raw.replace(/^\s*\d+\s+/, "").trim();

  // Split on commas, clean each part
  const parts = cleaned
    .split(",")
    .map((p) => p.trim().replace(/\.$/, ""))
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { department: null, hospital: null, city: null, country: null };

  // Country = last part
  const country = parts[parts.length - 1] || null;

  // City = second-to-last, but skip if it looks like a zip code or is just a number
  let city: string | null = null;
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (!ZIP_RE.test(candidate)) city = candidate;
  }

  // Find hospital and department by keyword scan
  let hospital: string | null = null;
  let department: string | null = null;

  for (const part of parts) {
    if (!hospital && HOSPITAL_RE.test(part)) hospital = part;
    if (!department && DEPT_RE.test(part)) department = part;
    if (hospital && department) break;
  }

  // Fallback: if still null, use positional heuristics
  if (!department && !hospital) {
    department = parts[0] ?? null;
    hospital   = parts.length > 1 ? parts[1] : null;
  } else if (!department) {
    department = parts[0] ?? null;
  } else if (!hospital && parts.length > 1) {
    // Use first non-department part as hospital
    hospital = parts.find((p) => p !== department) ?? null;
  }

  return { department, hospital, city, country };
}
