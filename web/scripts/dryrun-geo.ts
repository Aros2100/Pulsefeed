/**
 * dryrun-geo.ts
 *
 * Samples N articles with geo_source IS NULL, runs determineArticleGeo on
 * each (no OpenAlex fetch), and writes old+new values to geo_dryrun_results.
 * Does NOT modify the articles table.
 *
 * Run:
 *   npx tsx scripts/dryrun-geo.ts --run-name "dryrun 200 v1"
 *   npx tsx scripts/dryrun-geo.ts --run-name "dryrun 200 v1" --limit 200 --seed 42
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createAdminClient } from "@/lib/supabase/admin";
import { determineArticleGeo } from "@/lib/import/author-import/find-or-create";
import { decodeHtmlEntities } from "@/lib/import/article-import/fetcher";
import { randomUUID } from "crypto";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const runName = getArg("--run-name");
if (!runName) {
  console.error("Error: --run-name <string> is required.");
  process.exit(1);
}

const limit  = parseInt(getArg("--limit") ?? "200", 10);
const seed   = parseInt(getArg("--seed")  ?? "42",  10);

// ── Seeded shuffle (mulberry32) ───────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RawArticleRow = {
  id: string;
  pubmed_id: string | null;
  authors: unknown;
  geo_city: string | null;
  geo_state: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_continent: string | null;
  geo_institution: string | null;
  geo_department: string | null;
  geo_source: string | null;
  geo_parser_confidence: string | null;
};

type DryrunRow = {
  run_id: string;
  run_name: string;
  article_id: string;
  pubmed_id: string | null;
  old_geo_city: string | null;
  old_geo_state: string | null;
  old_geo_country: string | null;
  old_geo_region: string | null;
  old_geo_continent: string | null;
  old_geo_institution: string | null;
  old_geo_department: string | null;
  old_geo_source: string | null;
  old_geo_parser_confidence: string | null;
  new_geo_city: string | null;
  new_geo_state: string | null;
  new_geo_country: string | null;
  new_geo_region: string | null;
  new_geo_continent: string | null;
  new_geo_institution: string | null;
  new_geo_department: string | null;
  new_geo_source: string | null;
  new_geo_parser_confidence: string | null;
  changed_city: boolean;
  changed_state: boolean;
  changed_country: boolean;
  changed_institution: boolean;
  changed_department: boolean;
  input_affiliation: string | null;
  parse_error: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** NULL-safe equality: treats (null, null) as equal. */
function sameValue(a: string | null | undefined, b: string | null | undefined): boolean {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === null && bv === null) return true;
  return av === bv;
}

type FieldStats = {
  changed: number;
  nullToVal: number;
  valToNull: number;
  valToOther: number;
  examples: { pmid: string | null; old: string | null; new: string | null }[];
};

function makeStats(): FieldStats {
  return { changed: 0, nullToVal: 0, valToNull: 0, valToOther: 0, examples: [] };
}

function recordChange(
  stats: FieldStats,
  oldVal: string | null,
  newVal: string | null,
  pmid: string | null,
): void {
  if (sameValue(oldVal, newVal)) return;
  stats.changed++;
  if (!oldVal && newVal)        stats.nullToVal++;
  else if (oldVal && !newVal)   stats.valToNull++;
  else                          stats.valToOther++;
  if (stats.examples.length < 5) stats.examples.push({ pmid, old: oldVal, new: newVal });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const runId = randomUUID();
  const runStartedAt = new Date().toISOString();

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  dryrun-geo.ts");
  console.log(`  run_name: ${runName}`);
  console.log(`  run_id:   ${runId}`);
  console.log(`  limit:    ${limit}   seed: ${seed}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  // ── Sample articles ────────────────────────────────────────────────────────
  // Step 1: Fetch all eligible IDs (PostgREST doesn't support md5() in ORDER BY).
  // We shuffle in JS with a seeded RNG for reproducibility.
  const PAGE_SIZE = 1000;
  const allIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: idPage, error: idErr } = await admin
      .from("articles")
      .select("id")
      .is("geo_source", null)
      .not("authors", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (idErr) throw idErr;
    if (!idPage || idPage.length === 0) break;
    for (const r of idPage as { id: string }[]) allIds.push(r.id);
    if (idPage.length < PAGE_SIZE) break;
  }

  // Step 2: Seeded shuffle, take first limit IDs
  const shuffled   = seededShuffle(allIds, seed);
  const selectedIds = shuffled.slice(0, limit * 3); // fetch 3× to allow affiliation filter

  // Step 3: Fetch full rows for selected IDs in batches of 200
  const fullRows: RawArticleRow[] = [];
  const FETCH_BATCH = 200;
  for (let i = 0; i < selectedIds.length; i += FETCH_BATCH) {
    const chunk = selectedIds.slice(i, i + FETCH_BATCH);
    const { data: chunkRows, error: chunkErr } = await admin
      .from("articles")
      .select(
        "id, pubmed_id, authors, geo_city, geo_state, geo_country, geo_region, " +
        "geo_continent, geo_institution, geo_department, geo_source, geo_parser_confidence"
      )
      .in("id", chunk);
    if (chunkErr) throw chunkErr;
    if (chunkRows) fullRows.push(...(chunkRows as RawArticleRow[]));
  }

  // Re-order to match shuffled order (in() returns arbitrary order)
  const rowById = new Map(fullRows.map(r => [r.id, r]));
  const ordered = selectedIds.map(id => rowById.get(id)).filter(Boolean) as RawArticleRow[];

  // Step 4: Filter in JS — must have ≥1 author with a usable affiliation
  const eligible = ordered
    .filter((a) => {
      if (!Array.isArray(a.authors) || a.authors.length === 0) return false;
      const first = a.authors[0] as Record<string, unknown>;
      const aff0 = Array.isArray(first.affiliations)
        ? (first.affiliations as string[])[0]
        : (first.affiliation as string | undefined);
      return Boolean(aff0);
    })
    .slice(0, limit);

  console.log(`Sampled ${allIds.length} total IDs, ${eligible.length} eligible after affiliation filter.\n`);

  // ── Process each article ───────────────────────────────────────────────────
  const stats: Record<string, FieldStats> = {
    city:        makeStats(),
    state:       makeStats(),
    country:     makeStats(),
    institution: makeStats(),
    department:  makeStats(),
  };
  const geoSourceCounts: Record<string, number> = {
    parser_pubmed: 0, ror_enriched: 0, parser_openalex: 0, "null": 0,
  };
  const errorPmids: string[] = [];
  const countryChangedPmids: { pmid: string | null; old: string | null; new: string | null }[] = [];

  const dryrunRows: DryrunRow[] = [];

  for (const article of eligible) {
    const rawAuthors = article.authors as Record<string, unknown>[];

    // Map authors[0] to Author type — same as author-linker.ts lines 87-94
    const firstRaw = rawAuthors[0];
    const firstAuthor = {
      lastName:    decodeHtmlEntities(String(firstRaw.lastName  ?? "")),
      foreName:    decodeHtmlEntities(String(firstRaw.foreName  ?? "")),
      affiliations: Array.isArray(firstRaw.affiliations)
        ? (firstRaw.affiliations as string[])
        : firstRaw.affiliation != null ? [String(firstRaw.affiliation)] : [],
      orcid: firstRaw.orcid != null ? String(firstRaw.orcid) : null,
    };

    const inputAffiliation = firstAuthor.affiliations[0] ?? null;

    let result: Awaited<ReturnType<typeof determineArticleGeo>>;
    let parseError: string | null = null;

    try {
      result = await determineArticleGeo(admin, firstAuthor, null);
    } catch (e) {
      parseError = (e as Error).message;
      errorPmids.push(article.pubmed_id ?? article.id);
      // On error: copy old values to new
      result = {
        geo_city:          article.geo_city,
        geo_country:       article.geo_country,
        geo_state:         article.geo_state,
        geo_region:        article.geo_region,
        geo_continent:     article.geo_continent,
        geo_institution:   article.geo_institution,
        geo_department:    article.geo_department,
        geo_source:        article.geo_source as "ror_enriched" | "parser_pubmed" | "parser_openalex" | null,
        parser_confidence: article.geo_parser_confidence as "high" | "low" | null,
      };
    }

    // Compute change flags
    const changedCity        = !sameValue(article.geo_city,        result.geo_city);
    const changedState       = !sameValue(article.geo_state,       result.geo_state);
    const changedCountry     = !sameValue(article.geo_country,     result.geo_country);
    const changedInstitution = !sameValue(article.geo_institution, result.geo_institution);
    const changedDepartment  = !sameValue(article.geo_department,  result.geo_department);

    // Accumulate stats
    recordChange(stats.city,        article.geo_city,        result.geo_city,        article.pubmed_id);
    recordChange(stats.state,       article.geo_state,       result.geo_state,       article.pubmed_id);
    recordChange(stats.country,     article.geo_country,     result.geo_country,     article.pubmed_id);
    recordChange(stats.institution, article.geo_institution, result.geo_institution, article.pubmed_id);
    recordChange(stats.department,  article.geo_department,  result.geo_department,  article.pubmed_id);

    if (changedCountry && countryChangedPmids.length < 5) {
      countryChangedPmids.push({ pmid: article.pubmed_id, old: article.geo_country, new: result.geo_country });
    }

    const srcKey = result.geo_source ?? "null";
    geoSourceCounts[srcKey] = (geoSourceCounts[srcKey] ?? 0) + 1;

    dryrunRows.push({
      run_id:                   runId,
      run_name:                 runName!,
      article_id:               article.id,
      pubmed_id:                article.pubmed_id,
      old_geo_city:             article.geo_city,
      old_geo_state:            article.geo_state,
      old_geo_country:          article.geo_country,
      old_geo_region:           article.geo_region,
      old_geo_continent:        article.geo_continent,
      old_geo_institution:      article.geo_institution,
      old_geo_department:       article.geo_department,
      old_geo_source:           article.geo_source,
      old_geo_parser_confidence: article.geo_parser_confidence,
      new_geo_city:             result.geo_city,
      new_geo_state:            result.geo_state,
      new_geo_country:          result.geo_country,
      new_geo_region:           result.geo_region,
      new_geo_continent:        result.geo_continent,
      new_geo_institution:      result.geo_institution,
      new_geo_department:       result.geo_department,
      new_geo_source:           result.geo_source,
      new_geo_parser_confidence: result.parser_confidence,
      changed_city:             changedCity,
      changed_state:            changedState,
      changed_country:          changedCountry,
      changed_institution:      changedInstitution,
      changed_department:       changedDepartment,
      input_affiliation:        inputAffiliation,
      parse_error:              parseError,
    });
  }

  // ── Insert in batches of 50 ───────────────────────────────────────────────
  const BATCH = 50;
  for (let i = 0; i < dryrunRows.length; i += BATCH) {
    const batch = dryrunRows.slice(i, i + BATCH).map((r) => ({
      ...r,
      run_started_at: runStartedAt,
    }));
    const { error: insertError } = await admin.from("geo_dryrun_results").insert(batch);
    if (insertError) throw insertError;
  }

  // ── Stdout summary ─────────────────────────────────────────────────────────
  const total = dryrunRows.length;

  function pad(label: string, n: number): string {
    return `  ${label.padEnd(18)}changed: ${String(n).padStart(3)}`;
  }

  function subCounts(s: FieldStats): string {
    return `   (null->val: ${s.nullToVal}, val->null: ${s.valToNull}, val->other: ${s.valToOther})`;
  }

  console.log(`\n=== Dry run: ${runName} (run_id=${runId}) ===`);
  console.log(`Total articles processed:        ${total}`);
  console.log(`Errors during parse:             ${errorPmids.length}`);
  console.log("");
  console.log("Field changes (old -> new):");
  for (const [field, s] of Object.entries(stats)) {
    console.log(pad(`geo_${field}`, s.changed) + subCounts(s));
  }
  console.log("");
  console.log("geo_source assigned:");
  console.log(`  parser_pubmed:    ${geoSourceCounts["parser_pubmed"] ?? 0}`);
  console.log(`  ror_enriched:     ${geoSourceCounts["ror_enriched"]  ?? 0}    (expected 0 since firstOaAuthorship=null)`);
  console.log(`  parser_openalex:  ${geoSourceCounts["parser_openalex"] ?? 0}`);
  console.log(`  null:             ${geoSourceCounts["null"] ?? 0}`);

  if (stats.state.examples.filter(e => {
    const s = dryrunRows.find(r => r.pubmed_id === e.pmid);
    return s && s.old_geo_state !== null && s.new_geo_state !== null;
  }).length > 0 || stats.state.valToOther > 0) {
    console.log("\nExamples — geo_state changed val->other:");
    const stateExamples = dryrunRows
      .filter(r => r.changed_state && r.old_geo_state !== null && r.new_geo_state !== null)
      .slice(0, 5);
    for (const r of stateExamples) {
      console.log(`  PMID ${r.pubmed_id}: "${r.old_geo_state}" -> "${r.new_geo_state}"`);
    }
  }

  if (countryChangedPmids.length > 0) {
    console.log("\nExamples — geo_country changed:");
    for (const e of countryChangedPmids) {
      console.log(`  PMID ${e.pmid}: "${e.old}" -> "${e.new}"`);
    }
  }

  if (errorPmids.length > 0) {
    console.log("\nExamples — parse errors:");
    for (const pmid of errorPmids.slice(0, 5)) {
      const row = dryrunRows.find(r => r.pubmed_id === pmid || r.article_id === pmid);
      console.log(`  PMID ${pmid}: ${row?.parse_error}`);
    }
  }

  console.log(`\nRun complete. Query results with:`);
  console.log(`  SELECT * FROM geo_dryrun_results WHERE run_id = '${runId}';`);
  console.log("");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
