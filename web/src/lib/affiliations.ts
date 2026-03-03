export interface ParsedAffiliation {
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
}

const HOSPITAL_RE   = /hospital|clinic|center|centre|medical\s+cent|health\s+system|healthcare/i;
const DEPT_RE       = /\b(department|dept|division|section|unit|institute|faculty|school\s+of|college\s+of)\b/i;
const ZIP_RE        = /^\d[\d\s\-]{2,}$/;
const INLINE_ZIP_RE = /\s+\d[\d\s\-]{3,}$/;  // zip attached to city name
const US_STATE_RE   = /^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/;

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

  // Country = last part, stripped of trailing email addresses
  const country = (parts[parts.length - 1] || null)
    ?.replace(/\.\s*Electronic address:.*$/i, "")
    ?.replace(/\.\s*E-mail:.*$/i, "")
    ?.replace(/\.\s*email:.*$/i, "")
    ?.trim() || null;

  // City = second-to-last, but skip zip codes and handle US state abbreviations
  let city: string | null = null;
  if (parts.length >= 2) {
    const lastPart   = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    const thirdLast  = parts.length >= 3 ? parts[parts.length - 3] : null;

    // USA pattern: ..., City, STATE, USA
    const isUSA = /^USA?$/.test(lastPart?.replace(/\.$/, "") ?? "");
    if (isUSA && secondLast && US_STATE_RE.test(secondLast) && thirdLast) {
      city = thirdLast.replace(INLINE_ZIP_RE, "").trim() || null;
    } else if (!ZIP_RE.test(secondLast)) {
      // Strip inline zip codes like "Xi'an 710032" → "Xi'an"
      city = secondLast.replace(INLINE_ZIP_RE, "").trim() || null;
    }
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
