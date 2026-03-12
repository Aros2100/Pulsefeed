import { REGION_MAP } from "./continent-map";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const all = Object.keys(REGION_MAP).map(titleCase);
all.sort((a, b) => a.localeCompare(b));

// Move Denmark to first position
const idx = all.indexOf("Denmark");
if (idx > 0) {
  all.splice(idx, 1);
  all.unshift("Denmark");
}

export const COUNTRY_LIST: string[] = all;
