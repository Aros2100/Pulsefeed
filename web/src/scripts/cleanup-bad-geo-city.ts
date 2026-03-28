/**
 * cleanup-bad-geo-city.ts
 *
 * Nulls out all geo fields for articles where geo_city is a 1-2 uppercase-letter
 * initial (e.g. "SZ", "HY") — artefacts from the parser misinterpreting author
 * initials like "(SZ, HY, YL, RH)" as city names.
 *
 * Run backfill-missing-geo.ts afterwards to re-parse with the fixed parser.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/cleanup-bad-geo-city.ts --dry-run
 *   cd web && npx tsx src/scripts/cleanup-bad-geo-city.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !process.env[k]) process.env[k] = v;
}

import { createAdminClient } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Matches 1-2 uppercase ASCII letters only (author initials, not real city names)
const BAD_CITY_RE = /^[A-Z]{1,2}$/;

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  console.log(`[cleanup-bad-geo-city] Starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Fetch all articles with a non-null geo_city (paginated)
  const PAGE = 1000;
  let off = 0;
  const badIds: string[] = [];

  while (true) {
    const { data, error } = await db
      .from("articles")
      .select("id, geo_city")
      .not("geo_city", "is", null)
      .range(off, off + PAGE - 1);

    if (error) { console.error("[cleanup-bad-geo-city] Query error:", error.message); return; }
    if (!data?.length) break;

    for (const row of data as { id: string; geo_city: string }[]) {
      if (BAD_CITY_RE.test(row.geo_city)) {
        badIds.push(row.id);
        console.log(`  ${row.id}  geo_city="${row.geo_city}"`);
      }
    }

    if (data.length < PAGE) break;
    off += PAGE;
  }

  console.log(`\n[cleanup-bad-geo-city] Found ${badIds.length} articles with bad geo_city`);

  if (badIds.length === 0 || DRY_RUN) {
    if (DRY_RUN) console.log("[cleanup-bad-geo-city] DRY RUN — no writes");
    return;
  }

  // Null out all geo fields so backfill-missing-geo.ts picks them up
  const CHUNK = 500;
  let nulled = 0;
  for (let i = 0; i < badIds.length; i += CHUNK) {
    const chunk = badIds.slice(i, i + CHUNK);
    const { error } = await db
      .from("articles")
      .update({
        geo_city:      null,
        geo_country:   null,
        geo_state:     null,
        geo_region:    null,
        geo_continent: null,
      })
      .in("id", chunk);
    if (error) {
      console.error(`  Chunk ${i}–${i + CHUNK} update error:`, error.message);
    } else {
      nulled += chunk.length;
    }
  }

  console.log(`[cleanup-bad-geo-city] Nulled geo fields for ${nulled} articles`);
  console.log("Run backfill-missing-geo.ts to re-parse with the fixed parser.");
}

main().catch((err) => {
  console.error("[cleanup-bad-geo-city] Unhandled error:", err);
  process.exit(1);
});
