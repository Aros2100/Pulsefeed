/**
 * Normalize geo fields (city, state, country) for all authors with a ror_id
 * by fetching authoritative location data from the ROR API.
 * Overwrites existing values — use --dry-run to preview changes first.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/normalize-ror-geo.ts           # live
 *   cd web && npx tsx src/scripts/normalize-ror-geo.ts --dry-run # preview
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
  city: string | null;
  state: string | null;
  country: string | null;
  verified_by: string | null;
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
    console.warn(`  [ror] ${rorId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalProcessed = 0;
  let totalUpdated   = 0;
  let totalSkipped   = 0;
  let totalFailed    = 0;
  let batchNum       = 0;
  let offset         = 0;

  while (true) {
    batchNum++;

    const { data: authors, error } = await admin
      .from("authors")
      .select("id, display_name, ror_id, city, state, country, verified_by")
      .not("ror_id", "is", null)
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

    let batchUpdated = 0;

    for (const author of authors) {
      totalProcessed++;

      if (author.verified_by === "human") {
        totalSkipped++;
        continue;
      }

      const org = await fetchRorOrg(author.ror_id);

      if (!org?.locations?.length) {
        console.log(`  ${author.display_name} (${author.ror_id}): no locations`);
        totalFailed++;
        continue;
      }

      const geo = org.locations[0].geonames_details;

      if (!geo) {
        console.log(`  ${author.display_name} (${author.ror_id}): no geonames_details`);
        totalFailed++;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      const changes: string[] = [];

      if (geo.name) {
        const rorCity = geo.name ?? null;
        if (rorCity !== author.city) {
          updates.city = rorCity;
          changes.push(`city: ${author.city ?? "(null)"} -> ${rorCity ?? "(null)"}`);
        }
      }
      if (geo.country_subdivision_name && geo.country_subdivision_name !== author.state) {
        updates.state = geo.country_subdivision_name;
        changes.push(`state: ${author.state ?? "(null)"} -> ${geo.country_subdivision_name}`);
      }
      if (geo.country_name && geo.country_name !== author.country) {
        updates.country = geo.country_name;
        changes.push(`country: ${author.country ?? "(null)"} -> ${geo.country_name}`);
      }

      if (Object.keys(updates).length === 0) {
        totalSkipped++;
        continue;
      }

      console.log(`  ${author.display_name}: ${changes.join(", ")}${DRY_RUN ? " [dry]" : ""}`);

      if (!DRY_RUN) {
        const { error: updateError } = await admin
          .from("authors")
          .update(updates)
          .eq("id", author.id);

        if (updateError) {
          console.warn(`  Supabase error for ${author.id}: ${updateError.message}`);
          totalFailed++;
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("author_events").insert({
          author_id:  author.id,
          event_type: "geo_updated",
          payload:    { ...updates, source: "ror" },
        });
      }

      batchUpdated++;
      totalUpdated++;
    }

    console.log(`Batch ${batchNum}: ${authors.length} authors, updated=${batchUpdated}`);

    if (authors.length < BATCH_SIZE) break;

    offset += BATCH_SIZE;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Authors processed: ${totalProcessed}`);
  console.log(`  Updated:           ${totalUpdated}`);
  console.log(`  Already correct:   ${totalSkipped}`);
  console.log(`  No ROR data:       ${totalFailed}`);
  console.log(`  Batches:           ${batchNum}`);

  if (!DRY_RUN && totalUpdated > 0) {
    const admin2 = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: normRows, error: normErr } = await (admin2 as any).rpc("normalize_author_geo_city");
    if (normErr) {
      console.error("  normalize_author_geo_city failed:", normErr.message);
    } else {
      const rowsUpdated = Number(normRows ?? 0);
      console.log(`  normalize_author_geo_city: ${rowsUpdated} rows updated`);
      if (rowsUpdated > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin2 as any).from("author_events").insert({
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
