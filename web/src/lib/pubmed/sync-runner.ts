/**
 * sync-runner.ts
 *
 * Callable version of the pubmed-sync logic — used by the admin API route.
 * The CLI script at scripts/pubmed-sync.ts is kept as-is for manual runs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  splitPubmedArticles,
  parseArticleFragment,
  articleDetailsToDbUpdate,
  type ArticleDetails,
} from "@/lib/import/article-import/fetcher";
import { saveRawXml } from "@/lib/import/article-import/raw-writer";

// ── Config ─────────────────────────────────────────────────────────────────

const PUBMED_BATCH      = 20;
const RATE_MS           = 150;
const DB_PAGE           = 1_000;
const UPDATE_BATCH      = 100;
const BASE              = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const EFETCH_TIMEOUT_MS  = 30_000;
const EFETCH_MAX_RETRIES = 3;
const EFETCH_BACKOFF_MS  = [1_000, 3_000, 8_000];

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ── Normalizers ─────────────────────────────────────────────────────────────

function normStr(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normMesh(terms: unknown): string {
  if (!Array.isArray(terms)) return "[]";
  return JSON.stringify(
    [...terms]
      .map((t: { descriptor?: string; qualifiers?: string[] }) => ({
        d: (t.descriptor ?? "").toLowerCase(),
        q: [...(t.qualifiers ?? [])].sort(),
      }))
      .sort((a, b) => a.d.localeCompare(b.d))
  );
}

function normKeywords(kw: unknown): string {
  if (!Array.isArray(kw)) return "[]";
  return JSON.stringify([...kw].map(k => String(k).toLowerCase().trim()).sort());
}

function normPubTypes(pt: unknown): string {
  if (!Array.isArray(pt)) return "[]";
  return JSON.stringify([...pt].map(p => String(p).toLowerCase().trim()).sort());
}

function normOneAffiliation(a: Record<string, unknown>): string {
  if (Array.isArray(a.affiliations) && (a.affiliations as string[]).length > 0)
    return (a.affiliations as string[]).join("; ").toLowerCase().trim();
  if (typeof a.affiliation === "string" && a.affiliation)
    return a.affiliation.toLowerCase().trim();
  return "";
}

function normAuthors(authors: unknown): string {
  if (!Array.isArray(authors)) return "[]";
  return JSON.stringify(
    (authors as Record<string, unknown>[]).map(a => ({
      ln: ((a.lastName  as string | undefined) ?? "").toLowerCase(),
      fn: ((a.foreName  as string | undefined) ?? "").toLowerCase(),
      af: normOneAffiliation(a),
      or: ((a.orcid     as string | null | undefined) ?? "").toLowerCase(),
    }))
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DbArticle {
  id:                string;
  pubmed_id:         string;
  title:             string | null;
  abstract:          string | null;
  mesh_terms:        unknown;
  keywords:          unknown;
  publication_types: unknown;
  authors:           unknown;
  doi:               string | null;
  pmc_id:            string | null;
  language:          string | null;
  journal_title:     string | null;
  journal_abbr:      string | null;
  published_year:    number | null;
  published_date:    string | null;
  date_completed:    string | null;
  pubmed_indexed_at: string | null;
  volume:            string | null;
  issue:             string | null;
  article_number:    string | null;
  issn_electronic:   string | null;
  issn_print:        string | null;
  coi_statement:     string | null;
  grants:            unknown;
  substances:        unknown;
}

interface SyncLogEntry {
  pubmed_id:          string;
  event:              "updated" | "imported" | "retracted";
  fields_changed:     string[] | null;
  pubmed_modified_at: string | null;
}

type AdminDb = ReturnType<typeof createAdminClient>;

// ── EFetch (with retry + timeout) ──────────────────────────────────────────

async function efetchBatch(
  pmids: string[],
  apiKey: string,
): Promise<{ articles: ArticleDetails[]; rawXmlByPmid: Map<string, string> }> {
  const p = new URLSearchParams({ db: "pubmed", id: pmids.join(","), retmode: "xml" });
  if (apiKey) p.set("api_key", apiKey);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= EFETCH_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), EFETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/efetch.fcgi?${p}`, { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`efetch HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`efetch HTTP ${res.status} (non-retryable)`);
      }

      const xml = await res.text();
      const articleParts = splitPubmedArticles(xml);

      const articles: ArticleDetails[] = [];
      const rawXmlByPmid = new Map<string, string>();
      for (const { pmid, xml: articleXml } of articleParts) {
        rawXmlByPmid.set(pmid, articleXml);
        const details = parseArticleFragment(articleXml);
        if (details) articles.push(details);
      }

      return { articles, rawXmlByPmid };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;

      const msg = String((e as Error)?.message ?? e);
      const isNonRetryable = msg.includes("non-retryable");
      if (isNonRetryable || attempt === EFETCH_MAX_RETRIES) {
        throw e;
      }

      const delay = EFETCH_BACKOFF_MS[attempt] ?? 8_000;
      console.warn(`[pubmed-sync] efetch retry ${attempt + 1}/${EFETCH_MAX_RETRIES} efter ${delay}ms — ${msg}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── Failure tracking helpers ───────────────────────────────────────────────

async function recordBatchFailure(
  db: AdminDb,
  pmids: string[],
  error: unknown,
  runStartedAt: string,
): Promise<void> {
  const errMsg = String((error as Error)?.message ?? error).slice(0, 500);
  const now = new Date().toISOString();

  for (const pmid of pmids) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from("pubmed_sync_failures")
      .select("attempts, resolved_at, first_failed_at")
      .eq("pubmed_id", pmid)
      .maybeSingle();

    if (existing && existing.resolved_at === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("pubmed_sync_failures")
        .update({
          last_failed_at: now,
          attempts: (existing.attempts ?? 0) + 1,
          last_error: errMsg,
          run_started_at: runStartedAt,
        })
        .eq("pubmed_id", pmid);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("pubmed_sync_failures").upsert({
        pubmed_id: pmid,
        first_failed_at: existing ? existing.first_failed_at ?? now : now,
        last_failed_at: now,
        attempts: 1,
        last_error: errMsg,
        resolved_at: null,
        run_started_at: runStartedAt,
      }, { onConflict: "pubmed_id" });
    }
  }
}

async function markPmidsResolved(db: AdminDb, pmids: string[]): Promise<void> {
  if (pmids.length === 0) return;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from("pubmed_sync_failures")
    .update({ resolved_at: now })
    .in("pubmed_id", pmids)
    .is("resolved_at", null);
}

// ── ESearch ────────────────────────────────────────────────────────────────

async function esearch(
  query: string,
  mindate: string,
  maxdate: string,
  retmax: number,
  apiKey: string,
): Promise<string[]> {
  // PubMed ESearch hard-caps retstart at 9998; attempting higher returns malformed JSON.
  const PUBMED_ESEARCH_MAX = 9998;
  const all: string[] = [];
  let retstart = 0;
  for (;;) {
    if (retstart > PUBMED_ESEARCH_MAX) {
      console.warn(`[pubmed-sync] ESearch pagination cap reached (retstart=${retstart}), stopping at ${all.length} IDs`);
      break;
    }
    const p = new URLSearchParams({
      db: "pubmed", term: query,
      datetype: "mdat", mindate, maxdate,
      retmax: String(Math.min(retmax - retstart, 10_000)),
      retstart: String(retstart),
      retmode: "json",
    });
    if (apiKey) p.set("api_key", apiKey);
    const res = await fetch(`${BASE}/esearch.fcgi`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: p,
    });
    if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
    const rawText = await res.text();
    let json: { esearchresult: { idlist: string[]; count: string; ERROR?: string } };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      // PubMed sometimes returns invalid JSON (unescaped newlines) in error responses
      console.warn(`[pubmed-sync] ESearch JSON parse failed at retstart=${retstart}, stopping at ${all.length} IDs. Raw (first 300): ${rawText.slice(0, 300)}`);
      break;
    }
    const result = json.esearchresult;
    if (result?.ERROR) {
      console.warn(`[pubmed-sync] ESearch returned error at retstart=${retstart}: ${String(result.ERROR).slice(0, 200)}`);
      break;
    }
    const ids = result?.idlist ?? [];
    all.push(...ids);
    const total = Number(result?.count ?? 0);
    retstart += ids.length;
    if (retstart >= total || ids.length === 0 || all.length >= retmax) break;
    await sleep(RATE_MS);
  }
  return all;
}

// ── Main export ─────────────────────────────────────────────────────────────

export interface SyncRunnerOpts {
  mindate?:                 string;
  maxdate?:                 string;
  esearchRetmax?:           number;
  includePreviousFailures?: boolean;
  retryFailuresOnly?:       boolean;
}

export interface SyncRunnerResult {
  updated:       number;
  retracted:     number;
  failedBatches: number;
  failedPmids:   number;
}

export async function runPubmedSync(opts: SyncRunnerOpts = {}): Promise<SyncRunnerResult> {
  const { esearchRetmax = 10_000 } = opts;
  const db     = createAdminClient();
  const apiKey = process.env.PUBMED_API_KEY ?? "";

  const runStartedAt = new Date().toISOString();

  const today    = new Date();
  const toDate   = opts.maxdate ? new Date(opts.maxdate) : today;
  const fromDate = opts.mindate ? new Date(opts.mindate) : new Date(today.getTime() - 7 * 86_400_000);
  const mindate  = fmtDate(fromDate);
  const maxdate  = fmtDate(toDate);

  let matches: string[];

  if (opts.retryFailuresOnly) {
    console.log(`[pubmed-sync] Retry-only mode`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).rpc("pubmed_sync_failures_retry_candidates");
    if (error) throw error;
    matches = (data ?? []).map((r: { pubmed_id: string }) => r.pubmed_id);
    console.log(`[pubmed-sync] ${matches.length} fejlede PMIDs at retrye`);
  } else {
    console.log(`[pubmed-sync] Period: ${mindate} → ${maxdate}, retmax: ${esearchRetmax}`);

    // Step 1 — Fetch DB IDs
    const dbIds = new Set<string>();
    let page = 0;
    for (;;) {
      const { data, error } = await db
        .from("articles")
        .select("pubmed_id")
        .range(page * DB_PAGE, (page + 1) * DB_PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) if (row.pubmed_id) dbIds.add(row.pubmed_id);
      if (data.length < DB_PAGE) break;
      page++;
    }
    console.log(`[pubmed-sync] ${dbIds.size} artikler i DB`);

    // Step 2 — Build filter query (C1 + C4 from pubmed_filters, C2 from circle_2_sources)
    const { data: filters, error: filterErr } = await db
      .from("pubmed_filters")
      .select("query_string, circle")
      .eq("active", true)
      .in("circle", [1, 4]);
    if (filterErr) throw filterErr;

    const { data: c2Sources, error: c2Err } = await db
      .from("circle_2_sources")
      .select("type, value")
      .eq("active", true);
    if (c2Err) throw c2Err;

    const c1c4Parts = (filters ?? []).map(f => `(${f.query_string})`);
    const c2Parts   = (c2Sources ?? []).map(s => `("${s.value.replace(/"/g, '\\"')}"[AD])`);

    const allParts = [...c1c4Parts, ...c2Parts];
    if (allParts.length === 0) {
      throw new Error("No active filters found in pubmed_filters or circle_2_sources");
    }
    const filterQuery = allParts.join(" OR ");
    console.log(
      `[pubmed-sync] Filter: ${c1c4Parts.length} from pubmed_filters (C1/C4), ` +
      `${c2Parts.length} from circle_2_sources (C2)`,
    );

    // Step 3 — ESearch
    const pubmedIds = await esearch(filterQuery, mindate, maxdate, esearchRetmax, apiKey);
    console.log(`[pubmed-sync] ${pubmedIds.length} PMIDs fra PubMed`);

    // Step 4 — Cross-reference
    const newPmids: string[] = [];
    matches = [];
    for (const id of pubmedIds) {
      if (dbIds.has(id)) matches.push(id);
      else newPmids.push(id);
    }
    console.log(`[pubmed-sync] Match: ${matches.length}`);

    // Step 4.5 — Inkluder tidligere fejlede hvis opt-in
    if (opts.includePreviousFailures) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any).rpc("pubmed_sync_failures_retry_candidates");
      const extra = (data ?? []).map((r: { pubmed_id: string }) => r.pubmed_id);
      const matchSet = new Set(matches);
      const added = extra.filter((id: string) => !matchSet.has(id));
      matches.push(...added);
      console.log(`[pubmed-sync] +${added.length} tidligere fejlede inkluderet`);
    }
  }

  const logEntries: SyncLogEntry[] = [];
  let failedBatches = 0;
  let failedPmids   = 0;

  // Step 5 — Fetch matched DB records + compare + update
  if (matches.length > 0) {
    const dbMap = new Map<string, DbArticle>();
    for (let i = 0; i < matches.length; i += 1_000) {
      const batch = matches.slice(i, i + 1_000);
      const { data, error } = await db
        .from("articles")
        .select("id, pubmed_id, title, abstract, mesh_terms, keywords, publication_types, authors, doi, pmc_id, language, journal_title, journal_abbr, published_year, published_date, date_completed, pubmed_indexed_at, volume, issue, article_number, issn_electronic, issn_print, coi_statement, grants, substances")
        .in("pubmed_id", batch);
      if (error) throw error;
      for (const row of data ?? []) dbMap.set(row.pubmed_id, row as DbArticle);
    }

    for (let i = 0; i < matches.length; i += PUBMED_BATCH) {
      const batch = matches.slice(i, i + PUBMED_BATCH);
      let fetched: ArticleDetails[];
      let rawXmlByPmid: Map<string, string>;
      try {
        const result = await efetchBatch(batch, apiKey);
        fetched = result.articles;
        rawXmlByPmid = result.rawXmlByPmid;
        await markPmidsResolved(db, batch);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).slice(0, 200);
        console.error(`[pubmed-sync] efetch fejl ved batch ${i} efter retries: ${msg}`);
        failedBatches++;
        failedPmids += batch.length;
        await recordBatchFailure(db, batch, e, runStartedAt);
        continue;
      }

      for (const pm of fetched) {
        const row = dbMap.get(pm.pubmedId);
        if (!row) continue;

        // Save raw XML — fire-and-forget
        const rawXml = rawXmlByPmid.get(pm.pubmedId);
        if (rawXml) {
          saveRawXml(db, [{ articleId: row.id, pubmedId: pm.pubmedId, rawXml }], "pubmed_sync")
            .catch(err => console.error(`[pubmed-sync] saveRawXml failed for ${pm.pubmedId}:`, err));
        }

        const fullUpdate = articleDetailsToDbUpdate(pm);
        const now = new Date().toISOString();
        const update: Record<string, unknown> = { pubmed_synced_at: now };
        const changed: string[] = [];

        // Helper to normalize values for comparison
        const norm = (v: unknown): string => {
          if (v == null) return "";
          if (typeof v === "string") return v.trim();
          return JSON.stringify(v);
        };

        for (const [key, newVal] of Object.entries(fullUpdate)) {
          const oldVal = (row as unknown as Record<string, unknown>)[key];
          if (norm(oldVal) !== norm(newVal)) {
            update[key] = newVal;
            changed.push(key);
          }
        }

        // isRetracted check
        const isRetracted = pm.publicationTypes.some(
          (pt) => pt.toLowerCase().includes("retracted publication"),
        );
        if (isRetracted) {
          update.retracted = true;
          if (!changed.includes("publication_types")) changed.push("publication_types");
        }

        // Track authors change for audit fields
        if (changed.includes("authors")) {
          update.authors_changed = true;
          update.authors_raw_new = pm.authors;
        }

        // dateRevised → pubmed_modified_at
        if (pm.dateRevised) {
          update.pubmed_modified_at = pm.dateRevised;
        }

        if (changed.length === 0 && !isRetracted) {
          // No changes — just update sync timestamp
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from("articles")
            .update({ pubmed_synced_at: now })
            .eq("pubmed_id", pm.pubmedId);
          continue;
        }

        // Apply update
        const { error: updateErr } = await db
          .from("articles").update(update).eq("pubmed_id", pm.pubmedId);
        if (!updateErr) {
          const event: "updated" | "retracted" = isRetracted ? "retracted" : "updated";
          logEntries.push({
            pubmed_id:          pm.pubmedId,
            event,
            fields_changed:     changed.length > 0 ? changed : null,
            pubmed_modified_at: pm.dateRevised ?? null,
          });
        } else {
          console.error(`[pubmed-sync] update fejl for ${pm.pubmedId}: ${updateErr.message}`);
        }
      }

      if (i + PUBMED_BATCH < matches.length) await sleep(RATE_MS);
    }

    // Flush log entries
    for (let i = 0; i < logEntries.length; i += UPDATE_BATCH) {
      const batch = logEntries.slice(i, i + UPDATE_BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from("pubmed_sync_log").insert(batch);
      if (error) console.error("[pubmed-sync] log insert error:", error.message);
    }
  }

  console.log(
    `[pubmed-sync] Færdig. Updated: ${logEntries.length}, ` +
    `Failed batches: ${failedBatches} (${failedPmids} PMIDs)`,
  );

  return {
    updated:       logEntries.filter(l => l.event === "updated").length,
    retracted:     logEntries.filter(l => l.event === "retracted").length,
    failedBatches,
    failedPmids,
  };
}
