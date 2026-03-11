/**
 * Builds deduplicated article-level location summary arrays
 * from first and last author location fields.
 */

type AuthorLocation = {
  region: string | null;
  country: string | null;
  city: string | null;
  institution: string | null;
};

/** Case-insensitive dedup, keeps original casing from first occurrence, sorted */
function dedup(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(v);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

export function buildLocationSummary(
  first: AuthorLocation,
  last: AuthorLocation
): {
  article_regions: string[];
  article_countries: string[];
  article_cities: string[];
  article_institutions: string[];
} {
  return {
    article_regions: dedup([first.region, last.region]),
    article_countries: dedup([first.country, last.country]),
    article_cities: dedup([first.city, last.city]),
    article_institutions: dedup([first.institution, last.institution]),
  };
}
