/**
 * Central policy for whether state/province is relevant for a given country.
 * Used by parser, onboarding, user profile, geo drill-down, audit, and validator.
 *
 * mandatory = state is expected and should be displayed/collected
 * optional = state exists but is not culturally standard
 * hidden = state is irrelevant, never show
 */

export type StatePolicy = "mandatory" | "optional" | "hidden";

const MANDATORY_COUNTRIES = new Set([
  "United States",
  "Canada",
  "Australia",
  "Brazil",
  "India",
  "China",
  "Japan",
]);

const OPTIONAL_COUNTRIES = new Set([
  "Germany",
  "United Kingdom",
  "France",
  "Italy",
  "Spain",
  "Russia",
  "Mexico",
  "Turkey",
  "South Korea",
  "Indonesia",
  "Philippines",
  "Colombia",
  "Argentina",
  "South Africa",
  "Nigeria",
  "Poland",
  "Romania",
  "Ukraine",
  "Thailand",
  "Malaysia",
]);

export function getStatePolicy(country: string | null): StatePolicy {
  if (!country) return "hidden";
  if (MANDATORY_COUNTRIES.has(country)) return "mandatory";
  if (OPTIONAL_COUNTRIES.has(country)) return "optional";
  return "hidden";
}

/** Convenience: should state be shown in UI? */
export function showState(country: string | null): boolean {
  return getStatePolicy(country) !== "hidden";
}

/** Convenience: is missing state a data quality issue? */
export function stateMissing(country: string | null, state: string | null): boolean {
  return getStatePolicy(country) === "mandatory" && !state;
}
