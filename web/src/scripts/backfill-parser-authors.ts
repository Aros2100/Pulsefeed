/**
 * Upgrade parser-sourced authors that have an ORCID to OpenAlex data.
 * Fetches the OpenAlex author record by ORCID and enriches:
 *   openalex_id, ror_id, hospital, country, geo_source, enrichment timestamps.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/backfill-parser-authors.ts           # live
 *   cd web && npx tsx src/scripts/backfill-parser-authors.ts --dry-run # preview
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

const BATCH_SIZE    = 50;
const BATCH_DELAY_MS = 300;
const DRY_RUN       = process.argv.includes("--dry-run");
const MAILTO        = "digest@pulsefeed.dk";
const OPENALEX_BASE = "https://api.openalex.org";

interface AuthorRow {
  id: string;
  display_name: string;
  orcid: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface OAAuthorResult {
  id: string;
  affiliations?: Array<{
    institution?: {
      display_name?: string;
      ror?: string;
      country_code?: string;
    };
  }>;
}

function stripPrefix(url: string, prefix: string): string {
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

async function fetchAuthorByOrcid(orcid: string): Promise<OAAuthorResult | null> {
  const url = `${OPENALEX_BASE}/authors?filter=orcid:${orcid}&mailto=${MAILTO}&per_page=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `pulsefeed/1.0 (mailto:${MAILTO})` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`  [openalex] ORCID ${orcid}: HTTP ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as { results?: any[] };
    const results = data.results ?? [];
    return results.length > 0 ? (results[0] as OAAuthorResult) : null;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(
      `  [openalex] ORCID ${orcid}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalProcessed = 0;
  let totalUpgraded  = 0;
  let totalRorAdded  = 0;
  let batchNum       = 0;
  let offset         = 0;

  while (true) {
    batchNum++;

    const { data: authors, error } = await admin
      .from("authors")
      .select("id, display_name, orcid")
      .eq("geo_source", "parser")
      .not("orcid", "is", null)
      .is("openalex_id", null)
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

    let batchUpgraded = 0;
    let batchRor      = 0;

    for (const author of authors) {
      totalProcessed++;

      const oaAuthor = await fetchAuthorByOrcid(author.orcid);

      if (!oaAuthor) {
        console.log(`  ${author.display_name} (${author.orcid}): no OA match`);
        continue;
      }

      const now      = new Date().toISOString();
      const inst     = oaAuthor.affiliations?.[0]?.institution;
      const rawRor   = inst?.ror ?? null;
      const rawName  = inst?.display_name ?? null;
      const rawCC    = inst?.country_code ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {
        openalex_id:         stripPrefix(oaAuthor.id, "https://openalex.org/"),
        openalex_enriched_at: now,
        geo_source:          "openalex",
      };

      if (rawRor) {
        updates.ror_id          = stripPrefix(rawRor, "https://ror.org/");
        updates.ror_enriched_at = now;
        batchRor++;
      }

      if (rawName) {
        updates.hospital = rawName;
      }

      if (rawCC) {
        const countryName = lookupCountry(rawCC.toLowerCase());
        if (countryName) updates.country = countryName;
      }

      console.log(
        `  ${author.display_name}: openalex_id=${updates.openalex_id}` +
        (updates.ror_id ? ` ror=${updates.ror_id}` : "") +
        (updates.hospital ? ` hospital=${updates.hospital}` : "") +
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

      batchUpgraded++;
    }

    totalUpgraded += batchUpgraded;
    totalRorAdded += batchRor;

    console.log(
      `Batch ${batchNum}: ${authors.length} authors, ${batchUpgraded} upgraded, ${batchRor} +ror_id`
    );

    if (authors.length < BATCH_SIZE) break;

    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Authors processed:     ${totalProcessed}`);
  console.log(`  Authors upgraded:      ${totalUpgraded}`);
  console.log(`  ROR ids added:         ${totalRorAdded}`);
  console.log(`  Batches processed:     ${batchNum}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
