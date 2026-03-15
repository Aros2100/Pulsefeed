/**
 * generate-city-country-map.ts
 *
 * Fetches city names + country from geo_cities.
 * For cities with a unique country → direct mapping.
 * For ambiguous names (multiple countries) → pick highest population.
 * Exports Map<string, string> (lowercase city → country).
 *
 * Run from web/:
 *   npx tsx scripts/generate-city-country-map.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

interface Row {
  name: string;
  country: string | null;
  population: number | null;
}

async function main() {
  // ── Load .env.local ───────────────────────────────────────────────────────
  const envPath = resolve(process.cwd(), ".env.local");
  for (const ln of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = ln.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Fetch all cities with country and population ────────────────────────
  // Track: for each lowercase name → { country → maxPopulation }
  const cityMap = new Map<string, Map<string, number>>();
  const PAGE_SIZE = 1000;
  let offset = 0;

  console.log("Fetching cities from geo_cities...");

  while (true) {
    const { data, error } = await supabase
      .from("geo_cities")
      .select("name, country, population")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const row of data as Row[]) {
      if (!row.country) continue;
      const key = row.name.toLowerCase();
      let countries = cityMap.get(key);
      if (!countries) {
        countries = new Map();
        cityMap.set(key, countries);
      }
      const existing = countries.get(row.country) ?? 0;
      const pop = row.population ?? 0;
      if (pop > existing) countries.set(row.country, pop);
    }

    offset += data.length;
    if (offset % 10000 < PAGE_SIZE) {
      console.log(`  Fetched ${offset} rows...`);
    }

    if (data.length < PAGE_SIZE) break;
  }

  console.log(`Total unique city names: ${cityMap.size}`);

  // ── Resolve: pick country with highest population per city ──────────────
  const result = new Map<string, string>();
  for (const [cityLower, countries] of cityMap) {
    let bestCountry = "";
    let bestPop = -1;
    for (const [country, pop] of countries) {
      if (pop > bestPop) {
        bestPop = pop;
        bestCountry = country;
      }
    }
    if (bestCountry) result.set(cityLower, bestCountry);
  }

  console.log(`Resolved ${result.size} city→country mappings`);

  // ── Generate TypeScript file ────────────────────────────────────────────
  const sorted = [...result.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const outPath = resolve(process.cwd(), "src/lib/geo/city-country-map.ts");

  const lines = [
    "/**",
    " * Auto-generated from geo_cities table.",
    ` * ${sorted.length} city→country mappings (lowercase city → country).`,
    " * For ambiguous cities, the country with highest population is used.",
    " * Re-generate: npx tsx scripts/generate-city-country-map.ts",
    " */",
    "",
    "export const CITY_COUNTRY_MAP = new Map<string, string>([",
    ...sorted.map(([city, country]) => `  [${JSON.stringify(city)}, ${JSON.stringify(country)}],`),
    "]);",
    "",
  ];

  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Written ${outPath} (${sorted.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
