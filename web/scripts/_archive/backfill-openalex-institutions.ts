/**
 * Enrich authors that have openalex_id but missing hospital or country.
 * Fetches each author directly from OpenAlex /authors/{id} and fills in:
 *   hospital, country, ror_id (if null), ror_enriched_at.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/backfill-openalex-institutions.ts           # live
 *   cd web && npx tsx src/scripts/backfill-openalex-institutions.ts --dry-run # preview
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
import { lookupCountry } from "@/lib/geo/country-map";

const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 300;
const DRY_RUN        = process.argv.includes("--dry-run");
const MAILTO         = "digest@pulsefeed.dk";
const OPENALEX_BASE  = "https://api.openalex.org";

interface AuthorRow {
  id: string;
  display_name: string;
  openalex_id: string;
  ror_id: string | null;
  country: string | null;
}

interface OAAffiliation {
  institution?: {
    display_name?: string;
    ror?: string;
    country_code?: string;
  };
  years?: number[];
}

interface OAAuthorDetail {
  affiliations?: OAAffiliation[];
}

function stripPrefix(url: string, prefix: string): string {
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

async function fetchAuthorDetail(oaId: string): Promise<OAAuthorDetail | null> {
  const url = `${OPENALEX_BASE}/authors/${oaId}?mailto=${MAILTO}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `pulsefeed/1.0 (mailto:${MAILTO})` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`  [openalex] ${oaId}: HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as OAAuthorDetail;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(
      `  [openalex] ${oaId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function pickPrimaryAffiliation(affiliations: OAAffiliation[]): OAAffiliation | null {
  if (affiliations.length === 0) return null;

  // Sort by most recent year descending, take first
  return [...affiliations].sort((a, b) => {
    const maxYear = (aff: OAAffiliation) =>
      aff.years && aff.years.length > 0 ? Math.max(...aff.years) : 0;
    return maxYear(b) - maxYear(a);
  })[0];
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalProcessed  = 0;
  let totalHospital   = 0;
  let totalCountry    = 0;
  let totalRor        = 0;
  let batchNum        = 0;
  let offset          = 0;

  while (true) {
    batchNum++;

    const { data: authors, error } = await admin
      .from("authors")
      .select("id, display_name, openalex_id, ror_id, country")
      .not("openalex_id", "is", null)
      .or("hospital.is.null,country.is.null")
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

    let batchHospital = 0;
    let batchCountry  = 0;
    let batchRor      = 0;

    for (const author of authors) {
      totalProcessed++;

      const detail = await fetchAuthorDetail(author.openalex_id);

      if (!detail || !detail.affiliations?.length) {
        console.log(`  ${author.display_name} (${author.openalex_id}): no affiliations`);
        continue;
      }

      const primary = pickPrimaryAffiliation(detail.affiliations);
      const inst    = primary?.institution;

      if (!inst) {
        console.log(`  ${author.display_name}: no institution in primary affiliation`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      const now = new Date().toISOString();

      if (inst.display_name) {
        updates.hospital = inst.display_name;
        batchHospital++;
      }

      if (inst.country_code) {
        const countryName = lookupCountry(inst.country_code.toLowerCase());
        if (countryName) {
          updates.country = countryName;
          batchCountry++;
        }
      }

      if (inst.ror && !author.ror_id) {
        updates.ror_id          = stripPrefix(inst.ror, "https://ror.org/");
        updates.ror_enriched_at = now;
        batchRor++;

        // ROR lookup — hent city/state/country fra geonames_details
        const rorController = new AbortController();
        const rorTimeout = setTimeout(() => rorController.abort(), 10_000);
        try {
          const rorRes = await fetch(
            `https://api.ror.org/organizations/${updates.ror_id}`,
            { signal: rorController.signal }
          );
          clearTimeout(rorTimeout);
          if (rorRes.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rorData = (await rorRes.json()) as any;
            const geo = rorData.locations?.[0]?.geonames_details;
            if (geo?.name)                          updates.city    = geo.name;
            if (geo?.country_subdivision_name)      updates.state   = geo.country_subdivision_name;
            if (geo?.country_name && !author.country) updates.country = geo.country_name;
          }
        } catch {
          clearTimeout(rorTimeout);
        }
      }

      if (Object.keys(updates).length === 0) {
        console.log(`  ${author.display_name}: nothing to update`);
        continue;
      }

      console.log(
        `  ${author.display_name}:` +
        (updates.hospital ? ` hospital=${updates.hospital}` : "") +
        (updates.country  ? ` country=${updates.country}`   : "") +
        (updates.ror_id   ? ` ror=${updates.ror_id}`        : "") +
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

    totalHospital += batchHospital;
    totalCountry  += batchCountry;
    totalRor      += batchRor;

    console.log(
      `Batch ${batchNum}: ${authors.length} authors, ` +
      `+hospital=${batchHospital}, +country=${batchCountry}, +ror=${batchRor}`
    );

    if (authors.length < BATCH_SIZE) break;

    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Authors processed:     ${totalProcessed}`);
  console.log(`  Hospital added:        ${totalHospital}`);
  console.log(`  Country added:         ${totalCountry}`);
  console.log(`  ROR added:             ${totalRor}`);
  console.log(`  Batches processed:     ${batchNum}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
