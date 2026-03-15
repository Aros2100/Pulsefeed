import type { OpenAlexAuthorship } from "./client";

/**
 * Matches PubMed authors (by index) to OpenAlex authorships.
 * Pure function — no DB calls, no side effects.
 */
export function matchPubMedToOpenAlex(
  pubmedAuthors: Array<{ lastName: string; firstName?: string; initials?: string }>,
  oaAuthorships: OpenAlexAuthorship[]
): Map<number, OpenAlexAuthorship> {
  const result = new Map<number, OpenAlexAuthorship>();
  if (oaAuthorships.length === 0) return result;

  // Track which OA authorships have been claimed
  const claimed = new Set<number>();

  // Helper: extract last name from OpenAlex displayName (last word)
  function oaLastName(idx: number): string {
    const parts = oaAuthorships[idx].author.displayName.trim().split(/\s+/);
    return (parts[parts.length - 1] ?? "").toLowerCase();
  }

  // Helper: extract first initial from OpenAlex displayName (first char of first word)
  function oaFirstInitial(idx: number): string {
    const parts = oaAuthorships[idx].author.displayName.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "").toLowerCase();
  }

  // Helper: PubMed first initial
  function pmFirstInitial(pm: { firstName?: string; initials?: string }): string {
    const raw = pm.firstName || pm.initials || "";
    return (raw[0] ?? "").toLowerCase();
  }

  // ── Pass 1: Positional match with last-name validation ────────────────────
  for (let i = 0; i < pubmedAuthors.length; i++) {
    if (i >= oaAuthorships.length) break;
    const pmLast = pubmedAuthors[i].lastName.toLowerCase();
    if (pmLast && pmLast === oaLastName(i)) {
      result.set(i, oaAuthorships[i]);
      claimed.add(i);
    }
  }

  // ── Pass 2: Unmatched — scan entire OA list by last name ──────────────────
  for (let i = 0; i < pubmedAuthors.length; i++) {
    if (result.has(i)) continue;
    const pmLast = pubmedAuthors[i].lastName.toLowerCase();
    if (!pmLast) continue;

    // Find all unclaimed OA authorships with matching last name
    const candidates: number[] = [];
    for (let j = 0; j < oaAuthorships.length; j++) {
      if (claimed.has(j)) continue;
      if (oaLastName(j) === pmLast) candidates.push(j);
    }

    if (candidates.length === 1) {
      result.set(i, oaAuthorships[candidates[0]]);
      claimed.add(candidates[0]);
    } else if (candidates.length > 1) {
      // Tiebreak by first initial
      const pmInit = pmFirstInitial(pubmedAuthors[i]);
      if (pmInit) {
        const initialMatches = candidates.filter(
          (j) => oaFirstInitial(j) === pmInit
        );
        if (initialMatches.length === 1) {
          result.set(i, oaAuthorships[initialMatches[0]]);
          claimed.add(initialMatches[0]);
        }
        // Still ambiguous → skip this author
      }
    }
  }

  // ── Warning if too many unmatched ─────────────────────────────────────────
  const unmatchedPct =
    pubmedAuthors.length > 0
      ? (pubmedAuthors.length - result.size) / pubmedAuthors.length
      : 0;
  if (unmatchedPct > 0.2 && pubmedAuthors.length > 2) {
    console.warn(
      `[openalex] author match: only ${result.size}/${pubmedAuthors.length} matched ` +
        `(${Math.round((1 - unmatchedPct) * 100)}%) — possible data mismatch`
    );
  }

  return result;
}
