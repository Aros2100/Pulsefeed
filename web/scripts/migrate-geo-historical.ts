/**
 * migrate-geo-historical.ts  (v2)
 *
 * Two modes:
 *
 * 1. Batch mode (default):
 *    Re-processes historical articles (geo_source IS NULL), one batch of 1000
 *    per run. Logs to geo_migration_log. Marks changed articles with
 *    geo_source = 'reparsed_280426'.
 *
 *    npx tsx scripts/migrate-geo-historical.ts --run-name "test_dryrun" --batch-number 1 --dry-run
 *    npx tsx scripts/migrate-geo-historical.ts --run-name "reparsed_280426" --batch-number 1
 *
 * 2. Snapshot mode (--from-snapshot <table>):
 *    Runs the same parser logic on articles listed in a snapshot table and
 *    writes the results into the after_* columns of that table.
 *    No writes to articles or geo_migration_log.
 *
 *    npx tsx scripts/migrate-geo-historical.ts --from-snapshot geo_snapshot_100
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createAdminClient } from "@/lib/supabase/admin";
import { determineArticleGeo } from "@/lib/import/author-import/find-or-create";
import { decodeHtmlEntities } from "@/lib/import/article-import/fetcher";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { randomUUID } from "crypto";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const snapshotTable = getArg("--from-snapshot");

// ── Mode routing ──────────────────────────────────────────────────────────────

let runName:    string | undefined;
let batchNumber = 1;
let dryRun      = false;
let batchSize   = 1000;

if (snapshotTable) {
  // Snapshot mode — mutually exclusive with batch-mode args
  if (args.includes("--batch-number")) {
    console.error("Error: --from-snapshot cannot be combined with --batch-number.");
    process.exit(1);
  }
  if (args.includes("--dry-run")) {
    console.error("Error: --from-snapshot cannot be combined with --dry-run.");
    process.exit(1);
  }
} else {
  // Batch mode — require --run-name and --batch-number
  runName = getArg("--run-name");
  if (!runName) { console.error("Error: --run-name <string> is required."); process.exit(1); }

  const batchNumberRaw = getArg("--batch-number");
  if (!batchNumberRaw) { console.error("Error: --batch-number <int> is required."); process.exit(1); }
  batchNumber = parseInt(batchNumberRaw, 10);
  if (isNaN(batchNumber) || batchNumber < 1) { console.error("Error: --batch-number must be >= 1."); process.exit(1); }

  dryRun    = args.includes("--dry-run");
  batchSize = parseInt(getArg("--batch-size") ?? "1000", 10);
}

// ── Protection-rule helpers ───────────────────────────────────────────────────

/** Strip diacritics + lowercase + trim. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** NULL-safe equality. */
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/** R1: Does old appear as a case-insensitive, accent-stripped substring of affiliation? */
function appearsInAffiliation(old: string, affiliation: string): boolean {
  return norm(affiliation).includes(norm(old));
}

// ── R2: Alias map (bidirectional, v2) ─────────────────────────────────────────
// Each pair normalises to the same canonical bucket id.
// Source: observed naming variants in 200-article dry run.

const R2_ALIAS_PAIRS: [string, string][] = [
  ["state of berlin",              "berlin"],
  ["community of madrid",          "madrid"],
  ["valencian community",          "valencia"],
  ["region of murcia",             "murcia"],
  ["normandy",                     "normandie"],
  ["rhineland-palatinate",         "rheinland-pfalz"],
  ["south holland",                "zuid-holland"],
  ["friuli venezia giulia",        "friuli-venezia giulia"],
  ["cologne",                      "koln"],          // ö→o after norm
  ["bejaia",                       "bejaia"],         // béjaïa→bejaia after norm (both sides)
  ["beersheba",                    "beer-sheva"],
  ["beer sheva",                   "beer-sheva"],
  ["rhone-alpes",                  "auvergne-rhone-alpes"], // ô→o after norm
  ["auvergne",                     "auvergne-rhone-alpes"],
  ["bourgogne",                    "bourgogne-franche-comte"], // é→e after norm
  ["franche-comte",                "bourgogne-franche-comte"],
  ["aquitaine",                    "nouvelle-aquitaine"],
  ["alsace",                       "grand est"],
  ["lorraine",                     "grand est"],
  ["nord-pas-de-calais",           "hauts-de-france"],
  ["picardy",                      "hauts-de-france"],
  ["midi-pyrenees",                "occitanie"],      // é→e after norm
  ["languedoc-roussillon",         "occitanie"],
];

const R2_BUCKET = new Map<string, number>();
R2_ALIAS_PAIRS.forEach(([a, b], i) => {
  R2_BUCKET.set(norm(a), i);
  R2_BUCKET.set(norm(b), i);
});

function r2Same(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const ba = R2_BUCKET.get(na);
  const bb = R2_BUCKET.get(nb);
  return ba !== undefined && ba === bb;
}

// ── R3: US state code expansion ───────────────────────────────────────────────

const US_CODE_TO_STATE: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  DC:"District of Columbia",
};

const US_STATE_CODES = Object.keys(US_CODE_TO_STATE);

const R3_REGEX = new RegExp(
  `(?:,\\s*|\\s)(${US_STATE_CODES.join("|")})(?=[,. 0-9]|$)`,
  "g"
);

/** Returns the last US state code found in affiliation (closest to end/country). */
function lastUsStateCodeInAffiliation(affiliation: string): string | null {
  const matches = [...affiliation.matchAll(R3_REGEX)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].toUpperCase();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OldGeo = {
  geo_city:             string | null;
  geo_state:            string | null;
  geo_country:          string | null;
  geo_region:           string | null;
  geo_continent:        string | null;
  geo_institution:      string | null;
  geo_department:       string | null;
  geo_source:           string | null;
  geo_parser_confidence: string | null;
};

type RawArticleRow = OldGeo & {
  id:        string;
  pubmed_id: string | null;
  authors:   unknown;
};

type GeoResult = {
  geo_city:          string | null;
  geo_country:       string | null;
  geo_state:         string | null;
  geo_region:        string | null;
  geo_continent:     string | null;
  geo_institution:   string | null;
  geo_department:    string | null;
  geo_source:        "ror_enriched" | "parser_pubmed" | "parser_openalex" | null;
  parser_confidence: "high" | "low" | null;
};

// ── Apply protection rules R1–R4 ──────────────────────────────────────────────

function applyRules(
  old: OldGeo,
  raw: GeoResult,
  aff: string,
): {
  city:        string | null;
  state:       string | null;
  country:     string | null;
  region:      string | null;
  continent:   string | null;
  institution: string | null;
  department:  string | null;
  rules:       string[];
} {
  const rules: string[] = [];

  let city        = raw.geo_city;
  let state       = raw.geo_state;
  let country     = raw.geo_country;
  let institution = raw.geo_institution;
  let department  = raw.geo_department;

  // R1: Preserve old when raw is null AND old appears in affiliation
  // (city, country, institution — NOT state, NOT department)
  if (!raw.geo_city && old.geo_city && appearsInAffiliation(old.geo_city, aff)) {
    city = old.geo_city;
    rules.push("R1_preserve_city");
  }
  if (!raw.geo_country && old.geo_country && appearsInAffiliation(old.geo_country, aff)) {
    country = old.geo_country;
    rules.push("R1_preserve_country");
  }
  if (!raw.geo_institution && old.geo_institution && appearsInAffiliation(old.geo_institution, aff)) {
    institution = old.geo_institution;
    rules.push("R1_preserve_institution");
  }

  // R2: Treat naming variants as equivalent — keep old
  // Applies to: geo_state, geo_country
  // Guard: old !== raw_new (identical values need no rule — no churn to record)
  if (old.geo_state && raw.geo_state && old.geo_state !== raw.geo_state && r2Same(old.geo_state, raw.geo_state)) {
    state = old.geo_state;
    rules.push("R2_naming_state");
  }
  if (old.geo_country && raw.geo_country && old.geo_country !== raw.geo_country && r2Same(old.geo_country, raw.geo_country)) {
    country = old.geo_country;
    rules.push("R2_naming_country");
  }

  // R3: Use affiliation state code when it disagrees with raw state
  // Trigger: raw_state IS NOT NULL AND raw_country = 'United States'
  if (raw.geo_state && raw.geo_country === "United States") {
    const code = lastUsStateCodeInAffiliation(aff);
    if (code) {
      const expandedState = US_CODE_TO_STATE[code];
      if (expandedState && expandedState !== raw.geo_state) {
        state = expandedState;
        rules.push("R3_use_affiliation_state");
      }
    }
  }

  // R6: Preserve old state when city/country trekanten er stabil
  // Trigger: old_state non-null, raw_state null, same canonical city AND country.
  // Skip if R2 or R3 already decided state (they are more authoritative).
  // Uses raw.geo_city / raw.geo_country (pre-rule values) to check trekant stability.
  if (
    !rules.includes("R2_naming_state") &&
    !rules.includes("R3_use_affiliation_state") &&
    old.geo_state &&
    !raw.geo_state &&
    old.geo_country && raw.geo_country && r2Same(old.geo_country, raw.geo_country) &&
    old.geo_city   && raw.geo_city   && norm(old.geo_city) === norm(raw.geo_city)
  ) {
    state = old.geo_state;
    rules.push("R6_preserve_state");
  }

  // R4: Reject country change across continents — keep old
  if (old.geo_country && raw.geo_country && old.geo_country !== raw.geo_country) {
    const contOld = getContinent(old.geo_country);
    const contNew = getContinent(raw.geo_country);
    if (contOld && contNew && contOld !== contNew) {
      country = old.geo_country;
      rules.push("R4_country_continent_mismatch");
    }
  }

  // Re-derive region + continent from final country
  const region    = country ? getRegion(country)    : null;
  const continent = country ? getContinent(country) : null;

  return { city, state, country, region, continent, institution, department, rules };
}

// ── Snapshot mode ─────────────────────────────────────────────────────────────

async function runSnapshotMode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: string,
): Promise<void> {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  migrate-geo-historical.ts  — snapshot mode`);
  console.log(`  table: ${table}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  // 1. Fetch article IDs from snapshot table
  const { data: snapRows, error: snapErr } = await admin
    .from(table)
    .select("article_id");
  if (snapErr) throw snapErr;
  const articleIds = (snapRows as { article_id: string }[]).map((r) => r.article_id);
  console.log(`Snapshot table has ${articleIds.length} rows.\n`);

  // 2. Fetch full article data from articles
  // PostgREST .in() handles up to a few hundred IDs fine
  const { data: articleRows, error: artErr } = await admin
    .from("articles")
    .select(
      "id, pubmed_id, authors, geo_city, geo_state, geo_country, geo_region, " +
      "geo_continent, geo_institution, geo_department, geo_source, geo_parser_confidence"
    )
    .in("id", articleIds);
  if (artErr) throw artErr;

  const rows = (articleRows ?? []) as RawArticleRow[];
  console.log(`Fetched ${rows.length} articles from DB.\n`);

  // 3. Counters
  let processed = 0;
  let r5Skipped = 0;
  let errors    = 0;
  const fieldChanged = { city: 0, state: 0, country: 0, institution: 0, department: 0 };

  // 4. Process each article
  for (const article of rows) {
    try {
      const rawAuthors = article.authors as Record<string, unknown>[];
      if (!Array.isArray(rawAuthors) || rawAuthors.length === 0) {
        // No authors — leave after_* null, mark as parse_error
        await admin.from(table).update({
          after_geo_source: "parse_error",
          after_captured_at: new Date().toISOString(),
        }).eq("article_id", article.id);
        continue;
      }

      const firstRaw = rawAuthors[0];
      const firstAuthor = {
        lastName:    decodeHtmlEntities(String(firstRaw.lastName  ?? "")),
        foreName:    decodeHtmlEntities(String(firstRaw.foreName  ?? "")),
        affiliations: Array.isArray(firstRaw.affiliations)
          ? (firstRaw.affiliations as string[])
          : firstRaw.affiliation != null ? [String(firstRaw.affiliation)] : [],
        orcid: firstRaw.orcid != null ? String(firstRaw.orcid) : null,
      };

      const inputAffiliation: string | null = firstAuthor.affiliations[0] ?? null;
      if (!inputAffiliation) {
        await admin.from(table).update({
          after_geo_source: "parse_error",
          after_captured_at: new Date().toISOString(),
        }).eq("article_id", article.id);
        continue;
      }

      processed++;

      // R5: sparse affiliation
      const hasOldGeo = !!(article.geo_city || article.geo_country || article.geo_institution);
      if (hasOldGeo && inputAffiliation.trim().length < 30) {
        r5Skipped++;
        await admin.from(table).update({
          after_city:             article.geo_city,
          after_state:            article.geo_state,
          after_country:          article.geo_country,
          after_region:           article.geo_region,
          after_continent:        article.geo_continent,
          after_institution:      article.geo_institution,
          after_department:       article.geo_department,
          after_geo_source:       "r5_skipped",
          after_parser_confidence: article.geo_parser_confidence,
          after_captured_at:      new Date().toISOString(),
        }).eq("article_id", article.id);
        continue;
      }

      // determineArticleGeo
      let raw: GeoResult;
      try {
        raw = await determineArticleGeo(admin, firstAuthor, null);
      } catch (e) {
        errors++;
        console.error(`  parse error for ${article.pubmed_id ?? article.id}: ${(e as Error).message}`);
        await admin.from(table).update({
          after_geo_source: "parse_error",
          after_captured_at: new Date().toISOString(),
        }).eq("article_id", article.id);
        continue;
      }

      // Apply R1-R6-R4 (same order as batch mode)
      const { city, state, country, region, continent, institution, department } =
        applyRules(article, raw, inputAffiliation);

      // Track field changes (after vs before = same as after vs article current)
      if (!same(article.geo_city,        city))        fieldChanged.city++;
      if (!same(article.geo_state,       state))       fieldChanged.state++;
      if (!same(article.geo_country,     country))     fieldChanged.country++;
      if (!same(article.geo_institution, institution)) fieldChanged.institution++;
      if (!same(article.geo_department,  department))  fieldChanged.department++;

      // Write after_* to snapshot table (use canonical geo_source, not reparsed_280426)
      await admin.from(table).update({
        after_city:              city,
        after_state:             state,
        after_country:           country,
        after_region:            region,
        after_continent:         continent,
        after_institution:       institution,
        after_department:        department,
        after_geo_source:        raw.geo_source,
        after_parser_confidence: raw.parser_confidence,
        after_captured_at:       new Date().toISOString(),
      }).eq("article_id", article.id);

    } catch (loopErr) {
      errors++;
      console.error(`  unexpected error for ${article.pubmed_id ?? article.id}: ${(loopErr as Error).message}`);
      await admin.from(table).update({
        after_geo_source: "parse_error",
        after_captured_at: new Date().toISOString(),
      }).eq("article_id", article.id);
    }
  }

  // 5. Summary
  function p(label: string, val: number | string): string {
    return `  ${label.padEnd(28)}${val}`;
  }

  console.log(`\n=== Snapshot run on ${table} ===`);
  console.log(p("Articles to process:",    articleIds.length));
  console.log(p("Articles processed:",     processed));
  console.log(p("Articles skipped (R5):", r5Skipped));
  console.log(p("Errors during parse:",   errors));
  console.log("");
  console.log("Field changes (after vs before):");
  console.log(p("  geo_city changed:",        fieldChanged.city));
  console.log(p("  geo_state changed:",       fieldChanged.state));
  console.log(p("  geo_country changed:",     fieldChanged.country));
  console.log(p("  geo_institution changed:", fieldChanged.institution));
  console.log(p("  geo_department changed:",  fieldChanged.department));
  console.log("");
  console.log(`Done. Inspect with:`);
  console.log(`  SELECT * FROM ${table} WHERE after_captured_at IS NOT NULL;`);
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Route to snapshot mode if --from-snapshot is set
  if (snapshotTable) {
    await runSnapshotMode(admin, snapshotTable);
    return;
  }

  const runId        = randomUUID();
  const runStartedAt = new Date().toISOString();
  const offset       = (batchNumber - 1) * batchSize;

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  migrate-geo-historical.ts  (v2)");
  console.log(`  run_name:     ${runName}`);
  console.log(`  run_id:       ${runId}`);
  console.log(`  batch:        ${batchNumber}  (offset ${offset}, size ${batchSize})`);
  console.log(`  mode:         ${dryRun ? "DRY RUN (no writes to articles)" : "LIVE"}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  // Sanity-check alias map
  if (R2_ALIAS_PAIRS.length < 17) {
    console.error(`FATAL: R2 alias map has only ${R2_ALIAS_PAIRS.length} entries — expected >= 17. Aborting.`);
    process.exit(1);
  }
  console.log(`[init] R2 alias pairs: ${R2_ALIAS_PAIRS.length} pairs → ${R2_BUCKET.size} bucket entries`);
  for (const [a, b] of R2_ALIAS_PAIRS.slice(0, 3)) {
    console.log(`       sample: "${a}" ↔ "${b}" (bucket ${R2_BUCKET.get(norm(a))})`);
  }
  console.log(`[init] US state codes: ${US_STATE_CODES.length}`);
  console.log("");

  // ── Fetch batch ────────────────────────────────────────────────────────────
  const { data: pageRows, error: pageErr } = await admin
    .from("articles")
    .select(
      "id, pubmed_id, authors, geo_city, geo_state, geo_country, geo_region, " +
      "geo_continent, geo_institution, geo_department, geo_source, geo_parser_confidence"
    )
    .is("geo_source", null)
    .not("authors", "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (pageErr) throw pageErr;

  const rows = (pageRows ?? []) as RawArticleRow[];
  console.log(`Fetched ${rows.length} articles from DB (offset ${offset}).\n`);

  // ── Counters ───────────────────────────────────────────────────────────────
  let processed  = 0;
  let changed    = 0;
  let unchanged  = 0;
  let errors     = 0;
  let r5Skipped  = 0;

  const fieldChanged = { city: 0, state: 0, country: 0, institution: 0, department: 0 };
  const ruleFired: Record<string, number> = {
    R1_preserve_city: 0, R1_preserve_country: 0, R1_preserve_institution: 0,
    R2_naming_state: 0, R2_naming_country: 0,
    R3_use_affiliation_state: 0, R6_preserve_state: 0,
    R4_country_continent_mismatch: 0, R5_skip_sparse_affiliation: 0,
  };

  const auditBatch: Record<string, unknown>[] = [];

  // ── Process each article sequentially ─────────────────────────────────────
  for (const article of rows) {
    // Outer try/catch: every article MUST produce an audit row, no exceptions.
    try {

    const rawAuthors = article.authors as Record<string, unknown>[];

    // Articles where authors array is empty or non-array: write audit row (no change).
    if (!Array.isArray(rawAuthors) || rawAuthors.length === 0) {
      unchanged++;
      auditBatch.push(makeAuditRow({
        runId, runName: runName!, batchNumber, runStartedAt, article,
        final: { city: article.geo_city, state: article.geo_state, country: article.geo_country,
                 region: article.geo_region, continent: article.geo_continent,
                 institution: article.geo_institution, department: article.geo_department },
        raw: null, rules: ["skipped_no_authors"],
        inputAffiliation: null, parseError: null,
      }));
      continue;
    }

    const firstRaw = rawAuthors[0];
    const firstAuthor = {
      lastName:    decodeHtmlEntities(String(firstRaw.lastName  ?? "")),
      foreName:    decodeHtmlEntities(String(firstRaw.foreName  ?? "")),
      affiliations: Array.isArray(firstRaw.affiliations)
        ? (firstRaw.affiliations as string[])
        : firstRaw.affiliation != null ? [String(firstRaw.affiliation)] : [],
      orcid: firstRaw.orcid != null ? String(firstRaw.orcid) : null,
    };

    const inputAffiliation: string | null = firstAuthor.affiliations[0] ?? null;

    // Articles with no parsable affiliation: write audit row (no change).
    if (!inputAffiliation) {
      unchanged++;
      auditBatch.push(makeAuditRow({
        runId, runName: runName!, batchNumber, runStartedAt, article,
        final: { city: article.geo_city, state: article.geo_state, country: article.geo_country,
                 region: article.geo_region, continent: article.geo_continent,
                 institution: article.geo_institution, department: article.geo_department },
        raw: null, rules: ["skipped_no_affiliation"],
        inputAffiliation: null, parseError: null,
      }));
      continue;
    }

    processed++;

    // ── R5: Skip sparse affiliations ─────────────────────────────────────────
    const hasOldGeo = !!(article.geo_city || article.geo_country || article.geo_institution);
    if (hasOldGeo && inputAffiliation.trim().length < 30) {
      r5Skipped++;
      ruleFired["R5_skip_sparse_affiliation"]++;
      unchanged++;
      auditBatch.push(makeAuditRow({
        runId, runName: runName!, batchNumber, runStartedAt, article,
        final: { city: article.geo_city, state: article.geo_state, country: article.geo_country,
                 region: article.geo_region, continent: article.geo_continent,
                 institution: article.geo_institution, department: article.geo_department },
        raw: null, rules: ["R5_skip_sparse_affiliation"],
        inputAffiliation, parseError: null,
      }));
      continue;
    }

    // ── determineArticleGeo ───────────────────────────────────────────────────
    let raw: GeoResult;
    let parseError: string | null = null;

    try {
      raw = await determineArticleGeo(admin, firstAuthor, null);
    } catch (e) {
      parseError = (e as Error).message;
      errors++;
      raw = {
        geo_city: article.geo_city, geo_country: article.geo_country,
        geo_state: article.geo_state, geo_region: article.geo_region,
        geo_continent: article.geo_continent,
        geo_institution: article.geo_institution, geo_department: article.geo_department,
        geo_source: article.geo_source as GeoResult["geo_source"],
        parser_confidence: article.geo_parser_confidence as "high" | "low" | null,
      };
    }

    // ── Apply R1-R4 ───────────────────────────────────────────────────────────
    const { city, state, country, region, continent, institution, department, rules } =
      applyRules(article, raw, inputAffiliation);

    for (const r of rules) {
      ruleFired[r] = (ruleFired[r] ?? 0) + 1;
    }

    // ── Changed flags ─────────────────────────────────────────────────────────
    const changedCity        = !same(article.geo_city,        city);
    const changedState       = !same(article.geo_state,       state);
    const changedCountry     = !same(article.geo_country,     country);
    const changedInstitution = !same(article.geo_institution, institution);
    const changedDepartment  = !same(article.geo_department,  department);
    const anyChanged = changedCity || changedState || changedCountry || changedInstitution || changedDepartment;

    if (anyChanged) {
      changed++;
      if (changedCity)        fieldChanged.city++;
      if (changedState)       fieldChanged.state++;
      if (changedCountry)     fieldChanged.country++;
      if (changedInstitution) fieldChanged.institution++;
      if (changedDepartment)  fieldChanged.department++;
    } else {
      unchanged++;
    }

    // ── Write to articles (only if something changed, not dry-run) ────────────
    if (!dryRun && anyChanged) {
      const { error: updateErr } = await admin
        .from("articles")
        .update({
          geo_city:              city,
          geo_state:             state,
          geo_country:           country,
          geo_region:            region,
          geo_continent:         continent,
          geo_institution:       institution,
          geo_department:        department,
          geo_source:            "reparsed_280426",
          geo_parser_confidence: raw.parser_confidence,
          geo_defined_at:        new Date().toISOString(),
        })
        .eq("id", article.id);

      if (updateErr) {
        console.warn(`  WARN: articles update failed for ${article.pubmed_id ?? article.id}: ${updateErr.message}`);
      }
    }

    auditBatch.push(makeAuditRow({
      runId, runName: runName!, batchNumber, runStartedAt, article,
      final: { city, state, country, region, continent, institution, department },
      raw, rules, inputAffiliation, parseError,
    }));

    } catch (loopErr) {
      // Outer catch: something unexpected — still write audit row so no article is lost.
      errors++;
      auditBatch.push(makeAuditRow({
        runId, runName: runName!, batchNumber, runStartedAt, article,
        final: { city: article.geo_city, state: article.geo_state, country: article.geo_country,
                 region: article.geo_region, continent: article.geo_continent,
                 institution: article.geo_institution, department: article.geo_department },
        raw: null, rules: ["error_caught_in_loop"],
        inputAffiliation: null, parseError: (loopErr as Error).message,
      }));
    }
  }

  // ── Insert audit rows in batches of 50 ────────────────────────────────────
  const AUDIT_CHUNK = 50;
  for (let i = 0; i < auditBatch.length; i += AUDIT_CHUNK) {
    const chunk = auditBatch.slice(i, i + AUDIT_CHUNK);
    const { error: auditErr } = await admin.from("geo_migration_log").insert(chunk);
    if (auditErr) console.warn(`  WARN: audit insert error: ${auditErr.message}`);
  }

  // ── Reconciliation: verify every fetched article has an audit row ──────────
  const fetchedIds = new Set(rows.map((r) => r.id));
  const { data: loggedRows, error: logErr } = await admin
    .from("geo_migration_log")
    .select("article_id")
    .eq("run_id", runId);
  if (logErr) {
    console.error(`[RECONCILE] Could not verify audit rows: ${logErr.message}`);
  } else {
    const loggedIds = new Set((loggedRows as { article_id: string }[]).map((r) => r.article_id));
    const missing = [...fetchedIds].filter((id) => !loggedIds.has(id));
    if (missing.length > 0) {
      console.error(`[FATAL] ${missing.length} articles fetched but not logged:`);
      for (const id of missing.slice(0, 10)) console.error(`  ${id}`);
      process.exit(1);
    } else {
      console.log(`[RECONCILE] ✓ All ${fetchedIds.size} fetched articles have an audit row.`);
    }
  }

  // ── Stdout summary ─────────────────────────────────────────────────────────
  function p(label: string, val: number | string): string {
    return `  ${label.padEnd(35)}${val}`;
  }

  console.log(`\n=== Migration: ${runName} batch=${batchNumber} (run_id=${runId}) ===`);
  console.log(`Mode:                            ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(p("Articles in batch:",              rows.length));
  console.log(p("Articles processed:",             processed));
  console.log(p("Articles with at least 1 change:", changed));
  console.log(p("Articles unchanged:",             unchanged));
  console.log(p("Errors during parse:",            errors));
  console.log(p("Articles skipped (R5):",          r5Skipped));
  console.log("");
  console.log("Field changes (final new vs old):");
  console.log(p("  geo_city changed:",        fieldChanged.city));
  console.log(p("  geo_state changed:",       fieldChanged.state));
  console.log(p("  geo_country changed:",     fieldChanged.country));
  console.log(p("  geo_institution changed:", fieldChanged.institution));
  console.log(p("  geo_department changed:",  fieldChanged.department));
  console.log("");
  console.log("Protection rules fired:");
  console.log(p("  R1_preserve_city:",         ruleFired["R1_preserve_city"]));
  console.log(p("  R1_preserve_country:",      ruleFired["R1_preserve_country"]));
  console.log(p("  R1_preserve_institution:",  ruleFired["R1_preserve_institution"]));
  console.log(p("  R2_naming_state:",          ruleFired["R2_naming_state"]));
  console.log(p("  R2_naming_country:",        ruleFired["R2_naming_country"]));
  console.log(p("  R3_use_affiliation_state:", ruleFired["R3_use_affiliation_state"]));
  console.log(p("  R6_preserve_state:",        ruleFired["R6_preserve_state"]));
  console.log(p("  R4_country_continent:",     ruleFired["R4_country_continent_mismatch"]));
  console.log(p("  R5_skip_sparse_aff:",       ruleFired["R5_skip_sparse_affiliation"]));
  console.log("");
  console.log("geo_source assigned:");
  console.log(p("  reparsed_280426:", changed));
  console.log("");
  console.log(`Done. Next batch:`);
  console.log(`  npx tsx scripts/migrate-geo-historical.ts --run-name "${runName}" --batch-number ${batchNumber + 1}`);
  console.log("");
}

// ── Audit row factory ─────────────────────────────────────────────────────────

function makeAuditRow(opts: {
  runId: string;
  runName: string;
  batchNumber: number;
  runStartedAt: string;
  article: RawArticleRow;
  final: { city: string | null; state: string | null; country: string | null; region: string | null; continent: string | null; institution: string | null; department: string | null };
  raw: GeoResult | null;
  rules: string[];
  inputAffiliation: string | null;
  parseError: string | null;
}): Record<string, unknown> {
  const { runId, runName, batchNumber, runStartedAt, article, final, raw, rules, inputAffiliation, parseError } = opts;
  return {
    run_id:         runId,
    run_name:       runName,
    batch_number:   batchNumber,
    run_started_at: runStartedAt,
    article_id:     article.id,
    pubmed_id:      article.pubmed_id,
    old_geo_city:         article.geo_city,
    old_geo_state:        article.geo_state,
    old_geo_country:      article.geo_country,
    old_geo_region:       article.geo_region,
    old_geo_continent:    article.geo_continent,
    old_geo_institution:  article.geo_institution,
    old_geo_department:   article.geo_department,
    new_geo_city:         final.city,
    new_geo_state:        final.state,
    new_geo_country:      final.country,
    new_geo_region:       final.region,
    new_geo_continent:    final.continent,
    new_geo_institution:  final.institution,
    new_geo_department:   final.department,
    new_geo_source:            raw ? "reparsed_280426" : article.geo_source,
    new_geo_parser_confidence: raw?.parser_confidence ?? article.geo_parser_confidence,
    raw_geo_city:        raw?.geo_city       ?? null,
    raw_geo_state:       raw?.geo_state      ?? null,
    raw_geo_country:     raw?.geo_country    ?? null,
    raw_geo_institution: raw?.geo_institution ?? null,
    raw_geo_department:  raw?.geo_department  ?? null,
    protection_rules_fired: rules,
    changed_city:        !same(article.geo_city,        final.city),
    changed_state:       !same(article.geo_state,       final.state),
    changed_country:     !same(article.geo_country,     final.country),
    changed_institution: !same(article.geo_institution, final.institution),
    changed_department:  !same(article.geo_department,  final.department),
    input_affiliation:   inputAffiliation,
    parse_error:         parseError,
  };
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
