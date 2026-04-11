/**
 * sync-runner.ts
 *
 * Callable version of the pubmed-sync logic — used by the admin API route.
 * The CLI script at scripts/pubmed-sync.ts is kept as-is for manual runs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { XMLParser } from "fast-xml-parser";

// ── Config ─────────────────────────────────────────────────────────────────

const PUBMED_BATCH  = 20;
const RATE_MS       = 150;
const DB_PAGE       = 1_000;
const UPDATE_BATCH  = 100;
const BASE          = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// ── XML parser ─────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => [
    "PubmedArticle", "Author", "AffiliationInfo",
    "AbstractText", "MeshHeading", "QualifierName",
    "Keyword", "PublicationType", "Identifier",
  ].includes(name),
});

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function getText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object") return String((node as Record<string, unknown>)["#text"] ?? "");
  return String(node);
}

function toArr<T>(val: unknown): T[] {
  if (!val) return [];
  return Array.isArray(val) ? (val as T[]) : [val as T];
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

interface PmArticle {
  pubmedId:         string;
  title:            string;
  abstract:         string;
  meshTerms:        { descriptor: string; major: boolean; qualifiers: string[] }[];
  keywords:         string[];
  publicationTypes: string[];
  authors:          { lastName: string; foreName: string; affiliations: string[]; orcid: string | null }[];
  dateRevised:      string | null;
  isRetracted:      boolean;
}

interface DbArticle {
  pubmed_id:         string;
  title:             string | null;
  abstract:          string | null;
  mesh_terms:        unknown;
  keywords:          unknown;
  publication_types: unknown;
  authors:           unknown;
}

interface SyncLogEntry {
  pubmed_id:          string;
  event:              "updated" | "imported" | "retracted";
  fields_changed:     string[] | null;
  pubmed_modified_at: string | null;
}

// ── PubMed XML → PmArticle ─────────────────────────────────────────────────

function parseArticle(raw: Record<string, unknown>): PmArticle | null {
  try {
    const medline = raw.MedlineCitation as Record<string, unknown>;
    const pubmedId = getText(medline?.PMID);
    if (!pubmedId) return null;

    const article = medline?.Article as Record<string, unknown>;
    const title = getText(article?.ArticleTitle);
    const abstractNode = article?.Abstract as Record<string, unknown> | undefined;
    const abstract = toArr<unknown>(abstractNode?.AbstractText).map(getText).join(" ").trim();

    const meshList = medline?.MeshHeadingList as Record<string, unknown> | undefined;
    const meshTerms = toArr<Record<string, unknown>>(meshList?.MeshHeading).map(h => {
      const desc = h.DescriptorName as Record<string, unknown> | undefined;
      return {
        descriptor: getText(desc),
        major:      desc?.["@_MajorTopicYN"] === "Y",
        qualifiers: toArr<unknown>(h.QualifierName).map(getText).filter(Boolean),
      };
    });

    const kwList = medline?.KeywordList as Record<string, unknown> | undefined;
    const keywords = toArr<unknown>(kwList?.Keyword).map(getText).filter(Boolean);

    const ptList = article?.PublicationTypeList as Record<string, unknown> | undefined;
    const publicationTypes = toArr<unknown>(ptList?.PublicationType).map(getText).filter(Boolean);

    const authorList = article?.AuthorList as Record<string, unknown> | undefined;
    const authors = toArr<Record<string, unknown>>(authorList?.Author).map(a => {
      const orcidNode = toArr<Record<string, unknown>>(a.Identifier)
        .find(id => id["@_Source"] === "ORCID");
      return {
        lastName:     getText(a.LastName),
        foreName:     getText(a.ForeName) || getText(a.Initials),
        affiliations: toArr<Record<string, unknown>>(a.AffiliationInfo)
          .map(ai => getText(ai.Affiliation))
          .filter(Boolean),
        orcid: orcidNode ? getText(orcidNode).replace(/^https?:\/\/orcid\.org\//, "") : null,
      };
    });

    const dr = medline?.DateRevised as Record<string, unknown> | undefined;
    const dateRevised = dr
      ? `${getText(dr.Year)}-${getText(dr.Month).padStart(2, "0")}-${getText(dr.Day).padStart(2, "0")}`
      : null;

    const isRetracted = publicationTypes.some(pt => pt.toLowerCase().includes("retracted publication"));

    return { pubmedId, title, abstract, meshTerms, keywords, publicationTypes, authors, dateRevised, isRetracted };
  } catch {
    return null;
  }
}

// ── EFetch ─────────────────────────────────────────────────────────────────

async function efetchBatch(pmids: string[], apiKey: string): Promise<PmArticle[]> {
  const p = new URLSearchParams({ db: "pubmed", id: pmids.join(","), retmode: "xml" });
  if (apiKey) p.set("api_key", apiKey);
  const res = await fetch(`${BASE}/efetch.fcgi?${p}`);
  if (!res.ok) throw new Error(`efetch HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  return toArr<Record<string, unknown>>(parsed.PubmedArticleSet?.PubmedArticle)
    .map(parseArticle)
    .filter((a): a is PmArticle => a !== null);
}

// ── ESearch ────────────────────────────────────────────────────────────────

async function esearch(
  query: string,
  mindate: string,
  maxdate: string,
  retmax: number,
  apiKey: string,
): Promise<string[]> {
  const all: string[] = [];
  let retstart = 0;
  for (;;) {
    const p = new URLSearchParams({
      db: "pubmed", term: query,
      datetype: "mdat", mindate, maxdate,
      retmax: String(Math.min(retmax - retstart, 10_000)),
      retstart: String(retstart),
      retmode: "json",
    });
    if (apiKey) p.set("api_key", apiKey);
    const res = await fetch(`${BASE}/esearch.fcgi?${p}`);
    if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
    const json = await res.json() as { esearchresult: { idlist: string[]; count: string } };
    const result = json.esearchresult;
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
  daysBack?:      number;
  esearchRetmax?: number;
}

export async function runPubmedSync(opts: SyncRunnerOpts = {}): Promise<void> {
  const { daysBack = 7, esearchRetmax = 10_000 } = opts;
  const db     = createAdminClient();
  const apiKey = process.env.PUBMED_API_KEY ?? "";

  const now     = new Date();
  const mindate = fmtDate(new Date(now.getTime() - daysBack * 86_400_000));
  const maxdate = fmtDate(now);

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

  // Step 2 — Build filter query
  const { data: filters, error: filterErr } = await db
    .from("pubmed_filters")
    .select("query_string, circle")
    .eq("active", true)
    .in("circle", [1, 2]);
  if (filterErr) throw filterErr;
  if (!filters?.length) throw new Error("Ingen aktive C1/C2 filtre fundet i pubmed_filters");
  const filterQuery = filters.map(f => `(${f.query_string})`).join(" OR ");

  // Step 3 — ESearch
  const pubmedIds = await esearch(filterQuery, mindate, maxdate, esearchRetmax, apiKey);
  console.log(`[pubmed-sync] ${pubmedIds.length} PMIDs fra PubMed`);

  // Step 4 — Cross-reference
  const matches:  string[] = [];
  const newPmids: string[] = [];
  for (const id of pubmedIds) {
    if (dbIds.has(id)) matches.push(id);
    else newPmids.push(id);
  }
  console.log(`[pubmed-sync] Match: ${matches.length}, Nye: ${newPmids.length}`);

  const logEntries: SyncLogEntry[] = [];

  // Step 5 — Fetch matched DB records + compare + update
  if (matches.length > 0) {
    const dbMap = new Map<string, DbArticle>();
    for (let i = 0; i < matches.length; i += 1_000) {
      const batch = matches.slice(i, i + 1_000);
      const { data, error } = await db
        .from("articles")
        .select("pubmed_id, title, abstract, mesh_terms, keywords, publication_types, authors")
        .in("pubmed_id", batch);
      if (error) throw error;
      for (const row of data ?? []) dbMap.set(row.pubmed_id, row as DbArticle);
    }

    for (let i = 0; i < matches.length; i += PUBMED_BATCH) {
      const batch = matches.slice(i, i + PUBMED_BATCH);
      let fetched: PmArticle[];
      try {
        fetched = await efetchBatch(batch, apiKey);
      } catch (e) {
        console.error(`[pubmed-sync] efetch fejl ved batch ${i}:`, e);
        continue;
      }

      for (const pm of fetched) {
        const row = dbMap.get(pm.pubmedId);
        if (!row) continue;

        const changed: string[] = [];
        if (normStr(row.title)              !== normStr(pm.title))              changed.push("title");
        if (normStr(row.abstract)           !== normStr(pm.abstract))           changed.push("abstract");
        if (normMesh(row.mesh_terms)        !== normMesh(pm.meshTerms))         changed.push("mesh_terms");
        if (normKeywords(row.keywords)      !== normKeywords(pm.keywords))      changed.push("keywords");
        if (normPubTypes(row.publication_types) !== normPubTypes(pm.publicationTypes)) changed.push("publication_types");
        const authorsChanged = normAuthors(row.authors) !== normAuthors(pm.authors);
        if (authorsChanged) changed.push("authors");
        const isRetracted = pm.isRetracted;

        if (changed.length > 0 || isRetracted) {
          const update: Record<string, unknown> = { pubmed_synced_at: new Date().toISOString() };
          if (changed.includes("title"))             update.title             = pm.title;
          if (changed.includes("abstract"))          update.abstract          = pm.abstract;
          if (changed.includes("mesh_terms"))        update.mesh_terms        = pm.meshTerms;
          if (changed.includes("keywords"))          update.keywords          = pm.keywords;
          if (changed.includes("publication_types")) update.publication_types = pm.publicationTypes;
          if (authorsChanged) {
            update.authors_changed = true;
            update.authors_raw_new = pm.authors;
          }
          if (isRetracted) {
            update.retracted = true;
            if (!changed.includes("publication_types")) changed.push("publication_types");
          }
          if (pm.dateRevised) update.pubmed_modified_at = pm.dateRevised;

          const { error: updateErr } = await db
            .from("articles").update(update).eq("pubmed_id", pm.pubmedId);
          if (!updateErr) {
            const event: "updated" | "retracted" = isRetracted ? "retracted" : "updated";
            logEntries.push({
              pubmed_id:          pm.pubmedId,
              event,
              fields_changed:     changed.length > 0 ? changed : null,
              pubmed_modified_at: pm.dateRevised,
            });
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from("articles")
            .update({ pubmed_synced_at: new Date().toISOString() })
            .eq("pubmed_id", pm.pubmedId);
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

  // Log new PMIDs (not imported, just tracked)
  if (newPmids.length > 0) {
    const importedEntries: SyncLogEntry[] = newPmids.map(id => ({
      pubmed_id: id, event: "imported" as const, fields_changed: null, pubmed_modified_at: null,
    }));
    for (let i = 0; i < importedEntries.length; i += UPDATE_BATCH) {
      const batch = importedEntries.slice(i, i + UPDATE_BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from("pubmed_sync_log").insert(batch);
      if (error) console.error("[pubmed-sync] imported log insert error:", error.message);
    }
  }

  console.log(`[pubmed-sync] Færdig. Log entries: ${logEntries.length}`);
}
