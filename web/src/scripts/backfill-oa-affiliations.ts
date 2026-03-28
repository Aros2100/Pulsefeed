/**
 * backfill-oa-affiliations.ts
 *
 * For articles with openalex_work_id IS NOT NULL AND geo_country IS NULL:
 *
 *   1. Fetch the OpenAlex work by ID (GET /works/{id}?select=id,authorships)
 *   2. For each author at index i: if affiliation is null AND affiliations is
 *      empty/null, write rawAffiliationStrings[0] as affiliation into the
 *      authors JSONB. PubMed-supplied data is never overwritten.
 *   3. Geo-parse the (now-enriched) affiliations and write geo fields.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-oa-affiliations.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-oa-affiliations.ts
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
import { fetchWorkById } from "@/lib/openalex/client";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { lookupCountry, getRegion, getContinent } from "@/lib/geo/country-map";
import { lookupState } from "@/lib/geo/state-map";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const PAGE = 200;
const OA_DELAY_MS = 250; // stay well within OpenAlex rate limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawAuthor {
  lastName?: string;
  foreName?: string;
  affiliations?: string[];
  affiliation?: string;
  orcid?: string | null;
}

/** Returns false for strings that are too short or are just a bare country name. */
function isSubstantialAffiliation(s: string): boolean {
  const t = s.trim();
  if (t.length < 15) return false;
  // Skip "China", "Germany", "United States", etc. — no actionable detail
  if (t.split(/\s+/).length <= 3 && lookupCountry(t) !== null) return false;
  return true;
}

function getAllUniqueAffiliations(authors: RawAuthor[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const author of authors) {
    const affs =
      typeof author.affiliation === "string" && author.affiliation.trim()
        ? [author.affiliation]
        : Array.isArray(author.affiliations) && author.affiliations.length > 0
          ? author.affiliations
          : [];
    for (const aff of affs) {
      const t = aff.trim();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
  }
  return result;
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  console.log(`[oa-affiliations-backfill] Starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Load all candidate articles (paginated)
  const allArticles: {
    id: string;
    openalex_work_id: string;
    authors: unknown;
    specialty_tags: string[] | null;
  }[] = [];

  let off = 0;
  while (true) {
    const { data, error } = await db
      .from("articles")
      .select("id, openalex_work_id, authors, specialty_tags")
      .not("openalex_work_id", "is", null)
      .is("geo_country", null)
      .not("authors", "is", null)
      .range(off, off + PAGE - 1);

    if (error) { console.error("[oa-affiliations-backfill] Query error:", error.message); return; }
    if (!data?.length) break;
    for (const r of data) allArticles.push(r);
    if (data.length < PAGE) break;
    off += PAGE;
  }

  console.log(`[oa-affiliations-backfill] ${allArticles.length} candidate articles`);

  let oaFetched = 0;
  let oaFailed = 0;
  let affiliationPatched = 0;
  let geoUpdated = 0;
  let geoSkipped = 0;

  for (const article of allArticles) {
    const workId = article.openalex_work_id;

    // Fetch OA work by ID
    const oaWork = await fetchWorkById(workId);
    await sleep(OA_DELAY_MS);

    if (!oaWork) {
      oaFailed++;
      console.log(`  ${workId} → NOT FOUND`);
      continue;
    }
    oaFetched++;

    const rawAuthors = (
      Array.isArray(article.authors) ? article.authors : []
    ) as RawAuthor[];

    if (rawAuthors.length === 0) {
      geoSkipped++;
      continue;
    }

    // Pass 1: patch missing affiliations from OA by index
    let patched = false;
    const patchedRaw: RawAuthor[] = rawAuthors.map((ra, i) => {
      const hasAff =
        (Array.isArray(ra.affiliations) && ra.affiliations.length > 0) ||
        (typeof ra.affiliation === "string" && ra.affiliation.trim() !== "");
      if (!hasAff) {
        const oaAff = oaWork.authorships[i]?.rawAffiliationStrings[0];
        if (oaAff && isSubstantialAffiliation(oaAff)) {
          patched = true;
          return { ...ra, affiliation: oaAff };
        }
      }
      return ra;
    });

    if (patched) {
      affiliationPatched++;
      if (!DRY_RUN) {
        const { error } = await db
          .from("articles")
          .update({ authors: patchedRaw })
          .eq("id", article.id);
        if (error) {
          console.error(`  [authors JSONB update error] ${article.id}:`, error.message);
          geoSkipped++;
          continue;
        }
      }
    }

    // Pass 2: geo-parse enriched affiliations
    const allAffs = getAllUniqueAffiliations(patchedRaw);
    if (allAffs.length === 0) {
      geoSkipped++;
      continue;
    }

    let parsed = await parseAffiliation(allAffs[0]);
    if (!parsed?.country && allAffs.length > 1) {
      parsed = await parseAffiliation(allAffs.join("\n"));
    }

    if (!parsed?.country) {
      if (patched) {
        console.log(`  ${workId} (${article.id}) → affiliations patched but no country found`);
      }
      geoSkipped++;
      continue;
    }

    const geoCountry   = parsed.country ?? null;
    const geoCity      = parsed.city ?? null;
    const geoRegion    = geoCountry ? getRegion(geoCountry) : null;
    const geoContinent = geoCountry ? getContinent(geoCountry) : null;
    const geoState     = geoCity && geoCountry ? lookupState(geoCity, geoCountry) : null;

    if (DRY_RUN) {
      console.log(
        `  [dry-run] ${workId} (${article.id}) → country=${geoCountry} city=${geoCity}` +
        `${patched ? " [aff-patched]" : ""}`
      );
    } else {
      const { error } = await db
        .from("articles")
        .update({
          geo_country:         geoCountry,
          geo_city:            geoCity,
          geo_region:          geoRegion,
          geo_continent:       geoContinent,
          geo_state:           geoState,
          geo_institution:     parsed.institution ?? null,
          geo_department:      parsed.department ?? null,
          location_confidence: parsed.confidence,
          location_parsed_at:  new Date().toISOString(),
          specialty_tags:      article.specialty_tags ?? [],
        })
        .eq("id", article.id);

      if (error) {
        console.error(`  [geo update error] ${article.id}:`, error.message);
        geoSkipped++;
        continue;
      }

      const geoNext: GeoSnapshot = {
        geo_country:   geoCountry,
        geo_city:      geoCity,
        geo_state:     geoState,
        geo_region:    geoRegion,
        geo_continent: geoContinent,
        geo_institution: parsed.institution ?? null,
        geo_department:  parsed.department ?? null,
      };
      logGeoUpdatedEvent(article.id, "backfill", null, geoNext);
    }

    geoUpdated++;
  }

  console.log(`\n[oa-affiliations-backfill] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  candidates          : ${allArticles.length}`);
  console.log(`  OA works fetched    : ${oaFetched}`);
  console.log(`  OA fetch failed     : ${oaFailed}`);
  console.log(`  affiliations patched: ${affiliationPatched}`);
  console.log(`  geo updated         : ${geoUpdated}`);
  console.log(`  geo skipped         : ${geoSkipped}  (no country found or error)`);
}

main().catch((err) => {
  console.error("[oa-affiliations-backfill] Unhandled error:", err);
  process.exit(1);
});
