/**
 * generate-city-set.ts
 *
 * Fetches all unique lowercased city names from geo_cities and writes
 * a TypeScript file with a Set for fast lookup.
 *
 * Run from web/:
 *   npx tsx scripts/generate-city-set.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

  // ── Fetch all unique city names ───────────────────────────────────────────
  const names = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;

  console.log("Fetching city names from geo_cities...");

  while (true) {
    const { data, error } = await supabase
      .from("geo_cities")
      .select("name")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      names.add((row.name as string).toLowerCase());
    }

    offset += data.length;
    if (offset % 10000 < PAGE_SIZE) {
      console.log(`  Fetched ${offset} rows, ${names.size} unique names...`);
    }

    if (data.length < PAGE_SIZE) break;
  }

  console.log(`Total unique city names: ${names.size}`);

  // ── Generate TypeScript file ──────────────────────────────────────────────
  const sorted = [...names].sort();
  const outPath = resolve(process.cwd(), "src/lib/geo/city-set.ts");

  const lines = [
    "/**",
    " * Auto-generated from geo_cities table.",
    ` * ${sorted.length} unique city names (lowercased).`,
    " * Re-generate: npx tsx scripts/generate-city-set.ts",
    " */",
    "",
    "export const CITY_NAMES = new Set<string>([",
    ...sorted.map((n) => `  ${JSON.stringify(n)},`),
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
