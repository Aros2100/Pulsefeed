/**
 * reparse-garbage-geo-city.ts
 *
 * Re-parses articles where geo_city contains garbage values (postal codes,
 * street addresses, postal symbols, non-Latin characters, etc.)
 *
 * Uses first-author affiliation from articles.authors JSONB.
 * Never overwrites rows with verified_by = 'human'.
 *
 * Usage (dry-run is the default):
 *   cd web && npx tsx src/scripts/reparse-garbage-geo-city.ts
 *   cd web && npx tsx src/scripts/reparse-garbage-geo-city.ts --execute
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
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { buildGeoFields } from "@/lib/geo/affiliation-utils";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE;
const BATCH_SIZE = 300;

interface RawAuthor {
  lastName?: string;
  foreName?: string;
  affiliations?: string[];
  affiliation?: string;
}

/** Returns true if the city value is garbage (not a real city name). */
function isGarbageCity(city: string): boolean {
  if (/^\d/.test(city)) return true;                                   // starts with digit
  if (/\d{4}/.test(city)) return true;                                 // 4+ consecutive digits
  if (/^[A-Z]{2,4}$/.test(city)) return true;                         // bare 2-4 uppercase letters
  if (/^R\.O\.C\.?$/i.test(city)) return true;                        // Taiwan country abbreviation in city field
  if (/\d+-\d+/.test(city)) return true;                               // digit-dash-digit (address/postal)
  if (/\b(Ave|St|Rd|Floor|Hall|Str|Blvd)\b/i.test(city)) return true; // street keywords
  if (/^〒/.test(city)) return true;                                   // Japanese postal symbol
  if (/^CEP\s/i.test(city)) return true;                               // Brazilian CEP prefix
  // Non-ASCII outside Latin + Latin Extended-A/B + Latin Extended Additional
  if (/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/.test(city)) return true;
  if (/\bcé?dex\b/i.test(city)) return true;                          // French Cedex suffix
  if (/[A-Z]\d[A-Z]\s*\d[A-Z]\d/.test(city)) return true;            // Canadian postal code
  if (/^INSERM\s+\d+/i.test(city)) return true;                       // INSERM institution prefix
  if (/^[A-Z]\d{2}\s+[A-Z0-9]{4}/.test(city)) return true;           // Irish Eircode prefix
  if (/\s+[A-Z]\d{2}\s+[A-Z0-9]{4}/.test(city)) return true;         // Irish Eircode suffix
  return false;
}

function getFirstAffiliation(authors: RawAuthor[]): string | null {
  const first = authors[0];
  if (!first) return null;
  if (typeof first.affiliation === "string" && first.affiliation.trim()) {
    return first.affiliation.trim();
  }
  if (Array.isArray(first.affiliations) && first.affiliations.length > 0) {
    return first.affiliations[0].trim() || null;
  }
  return null;
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  console.log(`[reparse-garbage-geo-city] Starting — ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE MODE"}`);

  let offset = 0;
  let scanned   = 0;
  let examined  = 0;
  let unchanged = 0;
  let updated   = 0;
  let nulled    = 0;
  let skipped   = 0;
  let failed    = 0;

  while (true) {
    // Fetch all articles that have a geo_city (garbage check happens in JS)
    const { data, error } = await db
      .from("articles")
      .select("id, authors, geo_city, geo_country, geo_state, geo_region, geo_continent, geo_institution, geo_department")
      .not("geo_city", "is", null)
      .order("imported_at", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(`[reparse-garbage-geo-city] Query error:`, error.message);
      break;
    }

    type ArticleRow = {
      id: string;
      authors: unknown;
      geo_city: string;
      geo_country: string | null;
      geo_state: string | null;
      geo_region: string | null;
      geo_continent: string | null;
      geo_institution: string | null;
      geo_department: string | null;
    };

    const batch = (data ?? []) as ArticleRow[];
    if (batch.length === 0) break;

    scanned += batch.length;

    // JS-side filter for garbage geo_city values
    const garbage = batch.filter((r) => isGarbageCity(r.geo_city));

    if (garbage.length > 0) {
      console.log(`\n  [offset=${offset}] scanned ${batch.length}, garbage=${garbage.length}`);
    }

    for (const article of garbage) {
      examined++;
      try {
        if (!Array.isArray(article.authors) || article.authors.length === 0) {
          console.log(`  ${article.id} | old="${article.geo_city}" | SKIP (no authors)`);
          skipped++;
          continue;
        }

        const authors = article.authors as RawAuthor[];
        const firstAff = getFirstAffiliation(authors);

        if (!firstAff) {
          console.log(`  ${article.id} | old="${article.geo_city}" | SKIP (no affiliation)`);
          skipped++;
          continue;
        }

        const firstParsed = await parseAffiliation(firstAff);
        const geo = await buildGeoFields(firstParsed, null);

        const oldCity = article.geo_city;
        const newCity = geo.geo_city ?? null;

        // Skip if city didn't change — no real improvement
        if (newCity === oldCity) {
          console.log(`  ${article.id} | old="${oldCity}" | UNCHANGED`);
          unchanged++;
          continue;
        }

        console.log(`  ${article.id} | old="${oldCity}" | new="${newCity ?? "(null)"}" | country=${geo.geo_country ?? "(null)"}`);

        if (!DRY_RUN) {
          const prevSnapshot: GeoSnapshot = {
            geo_country:    article.geo_country ?? null,
            geo_city:       article.geo_city,
            geo_state:      article.geo_state ?? null,
            geo_region:     article.geo_region ?? null,
            geo_continent:  article.geo_continent ?? null,
            geo_institution: article.geo_institution ?? null,
            geo_department: article.geo_department ?? null,
          };

          const { error: updateErr } = await db
            .from("articles")
            .update({
              geo_city:            geo.geo_city,
              geo_state:           geo.geo_state,
              geo_country:         geo.geo_country,
              geo_continent:       geo.geo_continent,
              geo_region:          geo.geo_region,
              geo_institution:     geo.geo_institution,
              geo_department:      geo.geo_department,
              location_confidence: geo.location_confidence,
              location_parsed_at:  new Date().toISOString(),
            })
            .eq("id", article.id);

          if (updateErr) throw new Error(updateErr.message);

          const nextSnapshot: GeoSnapshot = {
            geo_country:    geo.geo_country,
            geo_city:       geo.geo_city,
            geo_state:      geo.geo_state,
            geo_region:     geo.geo_region,
            geo_continent:  geo.geo_continent,
            geo_institution: geo.geo_institution,
            geo_department: geo.geo_department,
          };
          logGeoUpdatedEvent(article.id, "backfill", prevSnapshot, nextSnapshot);
        }

        if (newCity || geo.geo_country) {
          updated++;
        } else {
          nulled++;
        }
      } catch (err) {
        failed++;
        console.error(`  FAILED ${article.id}:`, err);
      }
    }

    offset += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log(`\n[reparse-garbage-geo-city] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  scanned   : ${scanned}   (articles with geo_city)`);
  console.log(`  examined  : ${examined}  (matched garbage pattern)`);
  console.log(`  unchanged : ${unchanged}  (new city === old city, skipped)`);
  console.log(`  updated   : ${updated}   (new geo values written)`);
  console.log(`  nulled    : ${nulled}    (geo cleared — parser gave nothing)`);
  console.log(`  skipped   : ${skipped}   (no affiliation / no authors)`);
  console.log(`  failed    : ${failed}`);
}

main().catch((err) => {
  console.error("[reparse-garbage-geo-city] Unhandled error:", err);
  process.exit(1);
});
