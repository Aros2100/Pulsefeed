/**
 * Enrich authors with ror_id but missing city by fetching location data from ROR.
 * Fills in city (always), state and country only if currently null.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/backfill-ror-cities.ts           # live
 *   cd web && npx tsx src/scripts/backfill-ror-cities.ts --dry-run # preview
 */

import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  const val = trimmed.slice(eq + 1);
  if (!process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";

const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 500;
const DRY_RUN        = process.argv.includes("--dry-run");
const ROR_BASE       = "https://api.ror.org/organizations";

interface AuthorRow {
  id: string;
  display_name: string;
  ror_id: string;
  state: string | null;
  country: string | null;
}

interface RorGeonamesDetails {
  name?: string;
  country_subdivision_name?: string;
  country_name?: string;
}

interface RorOrg {
  locations?: Array<{
    geonames_details?: RorGeonamesDetails;
  }>;
}

async function fetchRorOrg(rorId: string): Promise<RorOrg | null> {
  const url = `${ROR_BASE}/${rorId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "pulsefeed/1.0 (mailto:digest@pulsefeed.dk)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`  [ror] ${rorId}: HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as RorOrg;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(
      `  [ror] ${rorId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalProcessed = 0;
  let totalCity      = 0;
  let totalState     = 0;
  let totalCountry   = 0;
  let batchNum       = 0;
  let offset         = 0;

  while (true) {
    batchNum++;

    const { data: authors, error } = await admin
      .from("authors")
      .select("id, display_name, ror_id, state, country")
      .not("ror_id", "is", null)
      .is("city", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1) as unknown as {
        data: AuthorRow[] | null;
        error: { message: string } | null;
      };

    if (error) {
      console.error("Query error:", error.message);
      break;
    }

    if (!authors || authors.length === 0) break;

    let batchCity    = 0;
    let batchState   = 0;
    let batchCountry = 0;

    for (const author of authors) {
      totalProcessed++;

      const org = await fetchRorOrg(author.ror_id);

      if (!org || !org.locations || org.locations.length === 0) {
        console.log(`  ${author.display_name} (${author.ror_id}): no locations`);
        continue;
      }

      const geo = org.locations[0].geonames_details;

      if (!geo) {
        console.log(`  ${author.display_name} (${author.ror_id}): no geonames_details`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};

      if (geo.name) {
        updates.city = geo.name ?? null;
        batchCity++;
      }

      if (geo.country_subdivision_name && !author.state) {
        updates.state = geo.country_subdivision_name;
        batchState++;
      }

      if (geo.country_name && !author.country) {
        updates.country = geo.country_name;
        batchCountry++;
      }

      if (Object.keys(updates).length === 0) {
        console.log(`  ${author.display_name}: nothing to update`);
        continue;
      }

      console.log(
        `  ${author.display_name}:` +
        (updates.city    ? ` city=${updates.city}`       : "") +
        (updates.state   ? ` state=${updates.state}`     : "") +
        (updates.country ? ` country=${updates.country}` : "") +
        (DRY_RUN ? " [dry]" : "")
      );

      if (!DRY_RUN) {
        const { error: updateError } = await admin
          .from("authors")
          .update(updates)
          .eq("id", author.id);

        if (updateError) {
          console.warn(`  Supabase error for ${author.id}: ${updateError.message}`);
          continue;
        }
      }
    }

    totalCity    += batchCity;
    totalState   += batchState;
    totalCountry += batchCountry;

    console.log(
      `Batch ${batchNum}: ${authors.length} authors, ` +
      `+city=${batchCity}, +state=${batchState}, +country=${batchCountry}`
    );

    if (authors.length < BATCH_SIZE) break;

    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Authors processed:     ${totalProcessed}`);
  console.log(`  City added:            ${totalCity}`);
  console.log(`  State added:           ${totalState}`);
  console.log(`  Country added:         ${totalCountry}`);
  console.log(`  Batches processed:     ${batchNum}`);

  if (!DRY_RUN && totalCity > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: normRows, error: normErr } = await (admin as any).rpc("normalize_author_geo_city");
    if (normErr) {
      console.error("  normalize_author_geo_city failed:", normErr.message);
    } else {
      const rowsUpdated = Number(normRows ?? 0);
      console.log(`  normalize_author_geo_city: ${rowsUpdated} rows updated`);
      if (rowsUpdated > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("author_events").insert({
          author_id:  null,
          event_type: "geo_updated",
          payload:    { source: "normalize_city", rows_updated: rowsUpdated },
        });
      }
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
