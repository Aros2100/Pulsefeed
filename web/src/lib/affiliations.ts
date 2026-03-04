export interface ParsedAffiliation {
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
}

// ── Keyword patterns ──────────────────────────────────────────────────────────

const HOSPITAL_RE = /hospital|clinic|center|centre|medical\s+cent|health\s+system|healthcare/i;
const DEPT_RE     = /\b(department|dept|division|section|unit|institute|faculty|school\s+of|college\s+of)\b/i;

// ── Zip / postal code patterns ────────────────────────────────────────────────

/** Standalone zip: "710032", "75013", "10001-1234" */
const ZIP_STANDALONE_RE = /^\d[\d\s\-]{2,}$/;

/** Zip appended to city: "Xi'an 710032", "Baltimore 21287" */
const ZIP_INLINE_RE = /\s+\d[\d\s\-]{3,}$/;

// ── US state patterns ─────────────────────────────────────────────────────────

/** Two-letter US state abbreviations */
const US_STATE_ABBR_RE = /^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/;

/** Full US state names */
const US_STATE_FULL_SET = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
]);

function isUSStateFull(s: string): boolean {
  return US_STATE_FULL_SET.has(s.toLowerCase());
}

// ── Country patterns ──────────────────────────────────────────────────────────

const USA_RE = /^USA?$/i;

/** Regex that matches a bare email address anywhere in a string */
const EMAIL_RE = /[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i;

/**
 * Extracts the first email address found in an affiliation string.
 * Strips "Electronic address:" / "E-mail:" prefix if present.
 */
export function extractEmail(raw: string): string | null {
  const match = raw.match(EMAIL_RE);
  return match?.[0] ?? null;
}

/**
 * Removes all email addresses (and their "Electronic address:" / "E-mail:" labels)
 * from an affiliation string, collapsing extra whitespace.
 */
export function stripEmailFromAffiliation(raw: string): string {
  return raw
    .replace(/\.\s*Electronic address:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\.\s*E-mail:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\.\s*email:\s*[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Strip email addresses and Electronic address appended after country */
function stripTrailingEmail(s: string): string {
  return s
    .replace(/\.\s*Electronic address:.*$/i, "")
    .replace(/\.\s*E-mail:.*$/i, "")
    .replace(/\.\s*email:.*$/i, "")
    .replace(/\.\s*[\w.\-]+@[\w.\-]+\.[a-z]{2,}$/i, "")
    .trim();
}

// ── Department cleanup ────────────────────────────────────────────────────────

/** Strip leading numbers PubMed sometimes prepends: "2Department of …" */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\d+/, "").trim();
}

// ── Core parser ───────────────────────────────────────────────────────────────

/**
 * Parses structured fields from a raw affiliations array using
 * regex / string heuristics — no external API calls.
 *
 * Handles:
 *  - Chinese/Asian postal codes appended to city ("Xi'an 710032")
 *  - US two-letter state abbreviations in city position ("MD", "TN")
 *  - US full state names in city position ("Tennessee", "Ohio")
 *  - Email addresses appended to country ("China. Electronic address: x@y.com")
 *  - Leading numbers on department ("2Department of Neurosurgery")
 *  - Standalone zip codes in city position
 */
export function parseAffiliation(
  affiliations: string[] | null
): ParsedAffiliation {
  const raw = affiliations?.find((a) => a.trim().length > 0);
  if (!raw) return { department: null, hospital: null, city: null, country: null };

  // Strip leading number PubMed sometimes prepends to the whole string ("1 Dept of…")
  const cleaned = raw.replace(/^\s*\d+\s+/, "").trim();

  // Split on commas, strip trailing dots, trim whitespace
  // Also strip email addresses from all parts (PubMed sometimes embeds them mid-string)
  const parts = cleaned
    .split(",")
    .map((p) => p.trim().replace(/\.$/, "").trim())
    .map((p) => p.replace(/[\w.\-]+@[\w.\-]+\.[a-z]{2,}/gi, "").trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { department: null, hospital: null, city: null, country: null };

  // ── Country ────────────────────────────────────────────────────────────────
  const rawCountry = parts[parts.length - 1] ?? "";
  const country = stripTrailingEmail(rawCountry) || null;

  // ── City ───────────────────────────────────────────────────────────────────
  let city: string | null = null;

  if (parts.length >= 2) {
    const isUSA      = USA_RE.test(country ?? "");
    const secondLast = parts[parts.length - 2];
    const thirdLast  = parts.length >= 3 ? parts[parts.length - 3] : null;
    const fourthLast = parts.length >= 4 ? parts[parts.length - 4] : null;

    if (isUSA) {
      // Pattern: …, City, ST, USA  (two-letter abbreviation)
      if (US_STATE_ABBR_RE.test(secondLast) && thirdLast) {
        city = thirdLast.replace(ZIP_INLINE_RE, "").trim() || null;

      // Pattern: …, City, Full State Name, USA
      } else if (isUSStateFull(secondLast) && thirdLast) {
        city = thirdLast.replace(ZIP_INLINE_RE, "").trim() || null;

      // Pattern: …, City, Zip, State, USA (rare)
      } else if (ZIP_STANDALONE_RE.test(secondLast) && thirdLast) {
        const candidate =
          isUSStateFull(thirdLast) || US_STATE_ABBR_RE.test(thirdLast)
            ? fourthLast
            : thirdLast;
        city = candidate?.replace(ZIP_INLINE_RE, "").trim() || null;

      } else {
        city = secondLast.replace(ZIP_INLINE_RE, "").trim() || null;
      }
    } else {
      // Non-US: second-to-last is city, unless it's a standalone zip
      if (!ZIP_STANDALONE_RE.test(secondLast)) {
        city = secondLast.replace(ZIP_INLINE_RE, "").trim() || null;
      } else if (thirdLast) {
        city = thirdLast.replace(ZIP_INLINE_RE, "").trim() || null;
      }
    }
  }

  // ── Hospital & Department ──────────────────────────────────────────────────
  let hospital: string | null = null;
  let department: string | null = null;

  for (const part of parts) {
    if (!hospital && HOSPITAL_RE.test(part)) hospital = part;
    if (!department && DEPT_RE.test(part))   department = stripLeadingNumber(part);
    if (hospital && department) break;
  }

  // Fallback positional heuristics
  if (!department && !hospital) {
    department = stripLeadingNumber(parts[0] ?? "");
    hospital   = parts.length > 1 ? parts[1] : null;
  } else if (!department) {
    const fallback = stripLeadingNumber(parts[0] ?? "");
    if (fallback !== hospital) department = fallback || null;
  } else if (!hospital && parts.length > 1) {
    const fallback = parts.find((p) => p !== department) ?? null;
    if (fallback !== department) hospital = fallback;
  }

  // Clean up empty strings from stripLeadingNumber
  if (department === "") department = null;

  return { department, hospital, city, country };
}
