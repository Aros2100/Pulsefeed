/**
 * fix-stale-geo-regions.ts
 *
 * Re-derives geo_region and geo_continent for articles that carry stale
 * UN-region names (e.g. "Western Asia", "South-Eastern Asia") that were
 * written before the canonical region map was established.
 *
 * The fix is purely derived from geo_country — no affiliation re-parsing needed.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/fix-stale-geo-regions.ts           # dry-run
 *   cd web && npx tsx src/scripts/fix-stale-geo-regions.ts --execute
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getRegion, getContinent } from "@/lib/geo/country-map";

const STALE_REGIONS = [
  "Western Asia",
  "Australia and New Zealand",
  "Eastern Africa",
  "Eastern Asia",
  "South-Eastern Asia",
  "Southern Asia",
];

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE;

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  console.log(`[fix-stale-geo-regions] Starting — ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE MODE"}`);
  console.log(`  Stale regions: ${STALE_REGIONS.join(", ")}`);

  const { data, error } = await db
    .from("articles")
    .select("id, geo_country, geo_region, geo_continent")
    .in("geo_region", STALE_REGIONS);

  if (error) {
    console.error("[fix-stale-geo-regions] Query error:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as {
    id: string;
    geo_country: string | null;
    geo_region: string | null;
    geo_continent: string | null;
  }[];

  console.log(`  Found ${rows.length} articles with stale geo_region\n`);

  let updated = 0;
  let skipped = 0;
  let failed  = 0;

  for (const row of rows) {
    if (!row.geo_country) {
      console.log(`  ${row.id} | region="${row.geo_region}" | SKIP (no geo_country)`);
      skipped++;
      continue;
    }

    const newRegion    = getRegion(row.geo_country);
    const newContinent = getContinent(row.geo_country);

    if (!newRegion) {
      console.log(`  ${row.id} | country="${row.geo_country}" | SKIP (unknown country)`);
      skipped++;
      continue;
    }

    console.log(
      `  ${row.id} | country="${row.geo_country}" | ` +
      `region: "${row.geo_region}" → "${newRegion}" | ` +
      `continent: "${row.geo_continent}" → "${newContinent}"`
    );

    if (!DRY_RUN) {
      const { error: updateErr } = await db
        .from("articles")
        .update({ geo_region: newRegion, geo_continent: newContinent })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`  FAILED ${row.id}:`, updateErr.message);
        failed++;
        continue;
      }
    }

    updated++;
  }

  console.log(`\n[fix-stale-geo-regions] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  found   : ${rows.length}`);
  console.log(`  updated : ${updated}`);
  console.log(`  skipped : ${skipped}`);
  console.log(`  failed  : ${failed}`);
}

main().catch((err) => {
  console.error("[fix-stale-geo-regions] Unhandled error:", err);
  process.exit(1);
});
