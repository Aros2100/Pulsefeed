/**
 * backfill-author-region-continent.ts
 *
 * Sætter region og continent på alle forfattere baseret på country
 * ved hjælp af getRegion() og getContinent() fra lib/geo/country-map.ts.
 * Springer forfattere over med verified_by = 'human'.
 *
 * Kør fra web/:
 *   npx tsx scripts/backfill-author-region-continent.ts            (dry run)
 *   npx tsx scripts/backfill-author-region-continent.ts --execute  (udfør opdateringer)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { getRegion, getContinent } from "../src/lib/geo/country-map";

// ── Load .env.local ────────────────────────────────────────────────────────
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

// ── Args ───────────────────────────────────────────────────────────────────
const EXECUTE = process.argv.includes("--execute");

// ── Supabase ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local");
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Types ──────────────────────────────────────────────────────────────────
type AuthorRow = {
  id: string;
  display_name: string;
  country: string;
  region: string | null;
  continent: string | null;
};

// ── Main ───────────────────────────────────────────────────────────────────
const PAGE_SIZE  = 1000;
const BATCH_SIZE = 100;

async function main() {
  console.log(`Mode: ${EXECUTE ? "LIVE (opdaterer DB)" : "DRY RUN (ingen ændringer skrives)"}\n`);

  let page         = 0;
  let totalFetched = 0;
  let totalChanged = 0;
  let totalSkipped = 0;
  let totalUnknown = 0;
  let totalUpdated = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data, error } = await db
      .from("authors")
      .select("id, display_name, country, region, continent")
      .not("country", "is", null)
      .is("deleted_at", null)
      .not("verified_by", "eq", "human")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("DB fejl:", error.message);
      process.exit(1);
    }

    const rows = (data as AuthorRow[]);
    if (rows.length === 0) break;

    totalFetched += rows.length;

    const updates: { id: string; region: string | null; continent: string | null }[] = [];

    for (const r of rows) {
      const newRegion    = getRegion(r.country);
      const newContinent = getContinent(r.country);

      if (newRegion === null && newContinent === null) {
        totalUnknown++;
        continue;
      }

      if (r.region === newRegion && r.continent === newContinent) {
        totalSkipped++;
        continue;
      }

      totalChanged++;
      updates.push({ id: r.id, region: newRegion, continent: newContinent });

      if (EXECUTE) {
        // Log only changes for debugging
      } else {
        console.log(
          `  ${r.display_name} (${r.country}):` +
          (r.region    !== newRegion    ? ` region: ${r.region ?? "(null)"} → ${newRegion}` : "") +
          (r.continent !== newContinent ? ` continent: ${r.continent ?? "(null)"} → ${newContinent}` : "")
        );
      }
    }

    if (EXECUTE && updates.length > 0) {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((u) =>
            db.from("authors")
              .update({ region: u.region, continent: u.continent })
              .eq("id", u.id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          console.error("Fejl ved update:", failed.error.message);
          process.exit(1);
        }
        totalUpdated += batch.length;

        await Promise.all(
          batch.map((u) =>
            db.from("author_events").insert({
              author_id:  u.id,
              event_type: "geo_updated",
              payload:    { region: u.region, continent: u.continent, source: "backfill" },
            })
          )
        );
      }
    }

    process.stdout.write(
      `\rSide ${page + 1}: ${totalFetched} hentet, ${totalChanged} ændrede, ${totalSkipped} uændrede, ${totalUnknown} ukendt land…`
    );

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  console.log("\n");
  console.log("── Sammenfatning ──────────────────────────────────────");
  console.log(`Forfattere hentet    : ${totalFetched}`);
  console.log(`Med ændringer        : ${totalChanged}`);
  console.log(`Allerede korrekte    : ${totalSkipped}`);
  console.log(`Ukendt land          : ${totalUnknown}`);

  if (EXECUTE) {
    console.log(`Opdateret i DB       : ${totalUpdated}`);
  } else {
    console.log(`\nDRY RUN — ingen ændringer skrevet.`);
    console.log(`Kør med --execute for at opdatere ${totalChanged} forfattere.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
