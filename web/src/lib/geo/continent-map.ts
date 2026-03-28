/**
 * Maps canonical country names to world regions.
 * Case-insensitive lookup. Returns null for unknown countries.
 */

export const REGION_MAP: Record<string, string> = {
  // Scandinavia
  "denmark": "Scandinavia",
  "sweden": "Scandinavia",
  "norway": "Scandinavia",
  "finland": "Scandinavia",
  "iceland": "Scandinavia",

  // Western Europe
  "united kingdom": "Western Europe",
  "ireland": "Western Europe",
  "france": "Western Europe",
  "belgium": "Western Europe",
  "netherlands": "Western Europe",
  "luxembourg": "Western Europe",
  "switzerland": "Western Europe",
  "austria": "Western Europe",
  "germany": "Western Europe",

  // Southern Europe
  "spain": "Southern Europe",
  "portugal": "Southern Europe",
  "italy": "Southern Europe",
  "greece": "Southern Europe",
  "malta": "Southern Europe",
  "cyprus": "Southern Europe",
  "andorra": "Southern Europe",
  "monaco": "Southern Europe",
  "san marino": "Southern Europe",
  "vatican city": "Southern Europe",

  // Eastern Europe
  "poland": "Eastern Europe",
  "czech republic": "Eastern Europe",
  "slovakia": "Eastern Europe",
  "hungary": "Eastern Europe",
  "romania": "Eastern Europe",
  "bulgaria": "Eastern Europe",
  "serbia": "Eastern Europe",
  "croatia": "Eastern Europe",
  "slovenia": "Eastern Europe",
  "bosnia and herzegovina": "Eastern Europe",
  "montenegro": "Eastern Europe",
  "north macedonia": "Eastern Europe",
  "albania": "Eastern Europe",
  "kosovo": "Eastern Europe",
  "moldova": "Eastern Europe",
  "ukraine": "Eastern Europe",
  "belarus": "Eastern Europe",
  "lithuania": "Eastern Europe",
  "latvia": "Eastern Europe",
  "estonia": "Eastern Europe",
  "georgia": "Eastern Europe",

  // Russia & Central Asia
  "russia": "Russia & Central Asia",
  "kazakhstan": "Russia & Central Asia",
  "uzbekistan": "Russia & Central Asia",
  "turkmenistan": "Russia & Central Asia",
  "tajikistan": "Russia & Central Asia",
  "kyrgyzstan": "Russia & Central Asia",
  "mongolia": "Russia & Central Asia",
  "armenia": "Russia & Central Asia",
  "azerbaijan": "Russia & Central Asia",

  // North America
  "united states": "North America",
  "canada": "North America",

  // Central America & Caribbean
  "mexico": "Central America & Caribbean",
  "guatemala": "Central America & Caribbean",
  "belize": "Central America & Caribbean",
  "honduras": "Central America & Caribbean",
  "el salvador": "Central America & Caribbean",
  "nicaragua": "Central America & Caribbean",
  "costa rica": "Central America & Caribbean",
  "panama": "Central America & Caribbean",
  "cuba": "Central America & Caribbean",
  "jamaica": "Central America & Caribbean",
  "haiti": "Central America & Caribbean",
  "dominican republic": "Central America & Caribbean",
  "trinidad and tobago": "Central America & Caribbean",
  "barbados": "Central America & Caribbean",
  "bahamas": "Central America & Caribbean",
  "curaçao": "Central America & Caribbean",
  "puerto rico": "Central America & Caribbean",

  // South America
  "brazil": "South America",
  "argentina": "South America",
  "chile": "South America",
  "colombia": "South America",
  "peru": "South America",
  "venezuela": "South America",
  "ecuador": "South America",
  "bolivia": "South America",
  "paraguay": "South America",
  "uruguay": "South America",
  "guyana": "South America",
  "suriname": "South America",

  // Middle East
  "turkey": "Middle East",
  "iran": "Middle East",
  "iraq": "Middle East",
  "saudi arabia": "Middle East",
  "united arab emirates": "Middle East",
  "qatar": "Middle East",
  "bahrain": "Middle East",
  "kuwait": "Middle East",
  "oman": "Middle East",
  "yemen": "Middle East",
  "jordan": "Middle East",
  "lebanon": "Middle East",
  "israel": "Middle East",
  "syria": "Middle East",
  "palestine": "Middle East",

  // North Africa
  "egypt": "North Africa",
  "libya": "North Africa",
  "tunisia": "North Africa",
  "algeria": "North Africa",
  "morocco": "North Africa",
  "sudan": "North Africa",

  // Sub-Saharan Africa
  "nigeria": "Sub-Saharan Africa",
  "south africa": "Sub-Saharan Africa",
  "kenya": "Sub-Saharan Africa",
  "ethiopia": "Sub-Saharan Africa",
  "ghana": "Sub-Saharan Africa",
  "tanzania": "Sub-Saharan Africa",
  "uganda": "Sub-Saharan Africa",
  "cameroon": "Sub-Saharan Africa",
  "senegal": "Sub-Saharan Africa",
  "democratic republic of the congo": "Sub-Saharan Africa",
  "mozambique": "Sub-Saharan Africa",
  "zimbabwe": "Sub-Saharan Africa",
  "zambia": "Sub-Saharan Africa",
  "rwanda": "Sub-Saharan Africa",
  "ivory coast": "Sub-Saharan Africa",
  "madagascar": "Sub-Saharan Africa",
  "angola": "Sub-Saharan Africa",
  "botswana": "Sub-Saharan Africa",
  "namibia": "Sub-Saharan Africa",
  "mali": "Sub-Saharan Africa",
  "burkina faso": "Sub-Saharan Africa",
  "niger": "Sub-Saharan Africa",
  "guinea": "Sub-Saharan Africa",
  "benin": "Sub-Saharan Africa",
  "togo": "Sub-Saharan Africa",
  "sierra leone": "Sub-Saharan Africa",
  "liberia": "Sub-Saharan Africa",
  "mauritania": "Sub-Saharan Africa",
  "eritrea": "Sub-Saharan Africa",
  "somalia": "Sub-Saharan Africa",
  "malawi": "Sub-Saharan Africa",
  "gambia": "Sub-Saharan Africa",
  "lesotho": "Sub-Saharan Africa",
  "eswatini": "Sub-Saharan Africa",
  "mauritius": "Sub-Saharan Africa",
  "cape verde": "Sub-Saharan Africa",
  "comoros": "Sub-Saharan Africa",
  "djibouti": "Sub-Saharan Africa",
  "equatorial guinea": "Sub-Saharan Africa",
  "gabon": "Sub-Saharan Africa",
  "são tomé and príncipe": "Sub-Saharan Africa",
  "seychelles": "Sub-Saharan Africa",
  "central african republic": "Sub-Saharan Africa",
  "south sudan": "Sub-Saharan Africa",
  "chad": "Sub-Saharan Africa",
  "republic of the congo": "Sub-Saharan Africa",
  "burundi": "Sub-Saharan Africa",

  // South Asia
  "india": "South Asia",
  "pakistan": "South Asia",
  "bangladesh": "South Asia",
  "sri lanka": "South Asia",
  "nepal": "South Asia",
  "bhutan": "South Asia",
  "afghanistan": "South Asia",
  "maldives": "South Asia",

  // East Asia
  "china": "East Asia",
  "japan": "East Asia",
  "south korea": "East Asia",
  "north korea": "East Asia",
  "taiwan": "East Asia",
  "hong kong": "East Asia",
  "macau": "East Asia",

  // Southeast Asia
  "thailand": "Southeast Asia",
  "vietnam": "Southeast Asia",
  "indonesia": "Southeast Asia",
  "philippines": "Southeast Asia",
  "malaysia": "Southeast Asia",
  "singapore": "Southeast Asia",
  "myanmar": "Southeast Asia",
  "cambodia": "Southeast Asia",
  "laos": "Southeast Asia",
  "brunei": "Southeast Asia",
  "east timor": "Southeast Asia",

  // Oceania
  "australia": "Oceania",
  "new zealand": "Oceania",
  "papua new guinea": "Oceania",
  "fiji": "Oceania",
  "samoa": "Oceania",
  "tonga": "Oceania",
  "vanuatu": "Oceania",
  "solomon islands": "Oceania",
  "micronesia": "Oceania",
  "kiribati": "Oceania",
  "marshall islands": "Oceania",
  "palau": "Oceania",
  "tuvalu": "Oceania",
  "nauru": "Oceania",
};

/** Case-insensitive country-to-region lookup. Returns null for unknown countries. */
export function getRegion(country: string): string | null {
  return REGION_MAP[country.trim().toLowerCase()] ?? null;
}

const REGION_TO_CONTINENT: Record<string, string> = {
  // Europe
  "scandinavia": "Europe",
  "western europe": "Europe",
  "southern europe": "Europe",
  "eastern europe": "Europe",
  // Americas
  "north america": "North America",
  "central america & caribbean": "North America",
  "south america": "South America",
  // Asia
  "east asia": "Asia",
  "south asia": "Asia",
  "southeast asia": "Asia",
  "middle east": "Asia",
  "western asia": "Asia",
  "russia & central asia": "Asia",
  // Africa
  "north africa": "Africa",
  "sub-saharan africa": "Africa",
  // Oceania
  "oceania": "Oceania",
  "australia and new zealand": "Oceania",
};

/** Maps a region name to its continent. Case-insensitive. Returns null for unknown regions. */
export function getContinent(region: string): string | null {
  return REGION_TO_CONTINENT[region.trim().toLowerCase()] ?? null;
}
