/**
 * pubmed-sync.ts
 *
 * Synkroniserer ændringer fra PubMed til vores DB via datetype=mdat.
 * Bruger aktive C1- og C2-filtre fra pubmed_filters-tabellen.
 * C3-artikler (circle_3_sources) er ikke inkluderet i esearch-query'en,
 * men eventuelle matches på pubmed_id håndteres korrekt under kryds-fasen.
 *
 * Kør fra web/:
 *   npx tsx scripts/pubmed-sync.ts
 *   npx tsx scripts/pubmed-sync.ts --mindate 2026/03/01 --maxdate 2026/04/04
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed[0] === "#") continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

// ── CLI args ───────────────────────────────────────────────────────────────
function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

const now      = new Date();
const MINDATE  = getArg("--mindate") ?? fmtDate(new Date(now.getTime() - 7 * 86_400_000));
const MAXDATE  = getArg("--maxdate") ?? fmtDate(now);

// ── Config ─────────────────────────────────────────────────────────────────
const PUBMED_BATCH    = 20;
const ESEARCH_RETMAX  = 10_000;
const RATE_MS         = 150;
const DB_PAGE         = 1_000;
const UPDATE_BATCH    = 100;

// ── Clients ────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const PUBMED_KEY   = process.env.PUBMED_API_KEY ?? "";
const BASE         = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

// ── XML helpers ────────────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────
interface PmArticle {
  pubmedId:        string;
  title:           string;
  abstract:        string;
  meshTerms:       { descriptor: string; major: boolean; qualifiers: string[] }[];
  keywords:        string[];
  publicationTypes: string[];
  authors:         { lastName: string; foreName: string; affiliations: string[]; orcid: string | null }[];
  dateRevised:     string | null;   // YYYY-MM-DD
  isRetracted:     boolean;
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

// ── Normalizers (same logic as pubmed-sync-test.ts) ────────────────────────
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

    const ptList  = article?.PublicationTypeList as Record<string, unknown> | undefined;
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
        orcid: orcidNode
          ? getText(orcidNode).replace(/^https?:\/\/orcid\.org\//, "")
          : null,
      };
    });

    // DateRevised → YYYY-MM-DD
    const dr = medline?.DateRevised as Record<string, unknown> | undefined;
    const dateRevised = dr
      ? `${getText(dr.Year)}-${getText(dr.Month).padStart(2, "0")}-${getText(dr.Day).padStart(2, "0")}`
      : null;

    const isRetracted = publicationTypes
      .some(pt => pt.toLowerCase().includes("retracted publication"));

    return { pubmedId, title, abstract, meshTerms, keywords, publicationTypes, authors, dateRevised, isRetracted };
  } catch {
    return null;
  }
}

// ── EFetch ─────────────────────────────────────────────────────────────────
async function efetchBatch(pmids: string[]): Promise<PmArticle[]> {
  const p = new URLSearchParams({ db: "pubmed", id: pmids.join(","), retmode: "xml" });
  if (PUBMED_KEY) p.set("api_key", PUBMED_KEY);
  const res = await fetch(`${BASE}/efetch.fcgi?${p}`);
  if (!res.ok) throw new Error(`efetch HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  return toArr<Record<string, unknown>>(parsed.PubmedArticleSet?.PubmedArticle)
    .map(parseArticle)
    .filter((a): a is PmArticle => a !== null);
}

// ── ESearch with mdat, paginated ───────────────────────────────────────────
async function esearch(query: string): Promise<string[]> {
  const all: string[] = [];
  let retstart = 0;
  for (;;) {
    const p = new URLSearchParams({
      db: "pubmed", term: query,
      datetype: "mdat", mindate: MINDATE, maxdate: MAXDATE,
      retmax: String(ESEARCH_RETMAX), retstart: String(retstart),
      retmode: "json",
    });
    if (PUBMED_KEY) p.set("api_key", PUBMED_KEY);
    const res = await fetch(`${BASE}/esearch.fcgi?${p}`);
    if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
    const json = await res.json() as { esearchresult: { idlist: string[]; count: string } };
    const result = json.esearchresult;
    const ids = result?.idlist ?? [];
    all.push(...ids);
    const total = Number(result?.count ?? 0);
    retstart += ids.length;
    process.stdout.write(`\r  esearch: ${all.length.toLocaleString()} / ${total.toLocaleString()} PMIDs`);
    if (retstart >= total || ids.length === 0) break;
    await sleep(RATE_MS);
  }
  return all;
}

// ── Fetch all DB pubmed_ids ────────────────────────────────────────────────
async function fetchDbIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 0;
  for (;;) {
    const { data, error } = await db
      .from("articles")
      .select("pubmed_id")
      .range(page * DB_PAGE, (page + 1) * DB_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) if (row.pubmed_id) ids.add(row.pubmed_id);
    if (data.length < DB_PAGE) break;
    page++;
  }
  return ids;
}

// ── Build combined C1+C2 query from pubmed_filters ─────────────────────────
async function buildFilterQuery(): Promise<string> {
  const { data, error } = await db
    .from("pubmed_filters")
    .select("query_string, name, circle")
    .eq("active", true)
    .in("circle", [1, 2]);
  if (error) throw error;
  if (!data?.length) throw new Error("Ingen aktive C1/C2 filtre fundet i pubmed_filters");

  const c1 = data.filter(f => f.circle === 1);
  const c2 = data.filter(f => f.circle === 2);
  console.log(`  C1-filtre: ${c1.length}  C2-filtre: ${c2.length}`);
  for (const f of data) console.log(`    • [C${f.circle}] ${f.name}`);

  return data.map(f => `(${f.query_string})`).join(" OR ");
}

// ── Write log entries in bulk ──────────────────────────────────────────────
async function flushLogs(entries: SyncLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  for (let i = 0; i < entries.length; i += UPDATE_BATCH) {
    const batch = entries.slice(i, i + UPDATE_BATCH);
    const { error } = await db.from("pubmed_sync_log").insert(batch);
    if (error) console.error("  [log] insert error:", error.message);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== PubMed Sync ===");
  console.log(`Period: ${MINDATE} → ${MAXDATE}\n`);

  // Step 1 — Fetch DB IDs
  console.log("Henter pubmed_ids fra DB…");
  const dbIds = await fetchDbIds();
  console.log(`  ${dbIds.size.toLocaleString()} artikler i DB\n`);

  // Step 2 — Build query + esearch
  console.log("Loader C1/C2-filtre fra pubmed_filters…");
  const filterQuery = await buildFilterQuery();
  console.log();

  console.log("ESearch — finder ændrede PMIDs i perioden…");
  const pubmedIds = await esearch(filterQuery);
  console.log(`\n  ${pubmedIds.length.toLocaleString()} PMIDs returneret fra PubMed\n`);

  // Step 3 — Cross-reference
  const matches:  string[] = [];
  const newPmids: string[] = [];

  for (const id of pubmedIds) {
    if (dbIds.has(id)) matches.push(id);
    else newPmids.push(id);
  }

  console.log(`Krydstjek:`);
  console.log(`  Match (i DB):     ${matches.length.toLocaleString()}`);
  console.log(`  Nye (ikke i DB):  ${newPmids.length.toLocaleString()}  (logges som 'imported', importeres ikke)\n`);

  const stats = {
    updated: 0, retracted: 0, unchanged: 0,
    fields: { title: 0, abstract: 0, mesh_terms: 0, keywords: 0, publication_types: 0, authors: 0 },
  };

  // Step 4 — Fetch matched DB records
  if (matches.length === 0) {
    console.log("Ingen matches — intet at opdatere.");
  } else {
    console.log(`Henter ${matches.length} artikler fra DB…`);
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
    console.log(`  ${dbMap.size} poster hentet\n`);

    // Step 5 — EFetch + compare + update
    console.log("EFetch + sammenligner felter…");

    const logEntries: SyncLogEntry[] = [];
    const syncedPmids: string[] = [];

    for (let i = 0; i < matches.length; i += PUBMED_BATCH) {
      const batch = matches.slice(i, i + PUBMED_BATCH);

      let fetched: PmArticle[];
      try {
        fetched = await efetchBatch(batch);
      } catch (e) {
        console.error(`\n  efetch fejl ved batch ${i}:`, e);
        continue;
      }

      for (const pm of fetched) {
        const row = dbMap.get(pm.pubmedId);
        if (!row) continue;

        syncedPmids.push(pm.pubmedId);

        // Detect changed fields
        const changed: string[] = [];
        if (normStr(row.title)              !== normStr(pm.title))              changed.push("title");
        if (normStr(row.abstract)           !== normStr(pm.abstract))           changed.push("abstract");
        if (normMesh(row.mesh_terms)        !== normMesh(pm.meshTerms))         changed.push("mesh_terms");
        if (normKeywords(row.keywords)      !== normKeywords(pm.keywords))      changed.push("keywords");
        if (normPubTypes(row.publication_types) !== normPubTypes(pm.publicationTypes)) changed.push("publication_types");

        const authorsChanged = normAuthors(row.authors) !== normAuthors(pm.authors);
        if (authorsChanged) changed.push("authors");

        const isRetracted = pm.isRetracted;

        // Build DB update
        if (changed.length > 0 || isRetracted) {
          const update: Record<string, unknown> = { pubmed_synced_at: new Date().toISOString() };

          if (changed.includes("title"))             update.title             = pm.title;
          if (changed.includes("abstract"))          update.abstract          = pm.abstract;
          if (changed.includes("mesh_terms"))        update.mesh_terms        = pm.meshTerms;
          if (changed.includes("keywords"))          update.keywords          = pm.keywords;
          if (changed.includes("publication_types")) update.publication_types = pm.publicationTypes;

          if (authorsChanged) {
            update.authors_changed  = true;
            update.authors_raw_new  = pm.authors;
            // Note: article_authors table is NOT touched here
          }

          if (isRetracted) {
            update.retracted = true;
            if (!changed.includes("publication_types")) changed.push("publication_types");
          }

          const { error: updateErr } = await db
            .from("articles")
            .update(update)
            .eq("pubmed_id", pm.pubmedId);

          if (updateErr) {
            console.error(`\n  [${pm.pubmedId}] update fejl:`, updateErr.message);
          } else {
            const event: "updated" | "retracted" = isRetracted ? "retracted" : "updated";
            logEntries.push({
              pubmed_id:          pm.pubmedId,
              event,
              fields_changed:     changed.length > 0 ? changed : null,
              pubmed_modified_at: pm.dateRevised,
            });

            if (isRetracted) stats.retracted++;
            else             stats.updated++;
            for (const f of changed) {
              if (f in stats.fields) stats.fields[f as keyof typeof stats.fields]++;
            }

            console.log(`  [${pm.pubmedId}] ${event}: ${changed.join(", ") || "—"}`);
          }
        } else {
          stats.unchanged++;
          // Still mark as synced
          await db.from("articles")
            .update({ pubmed_synced_at: new Date().toISOString() })
            .eq("pubmed_id", pm.pubmedId);
        }
      }

      if (i + PUBMED_BATCH < matches.length) await sleep(RATE_MS);
      process.stdout.write(`\r  Behandlet: ${Math.min(i + PUBMED_BATCH, matches.length)}/${matches.length}`);
    }

    console.log("\n");

    // Flush log entries
    if (logEntries.length > 0) {
      await flushLogs(logEntries);
      console.log(`  ${logEntries.length} log-rækker skrevet til pubmed_sync_log`);
    }
  }

  // Log new (not-in-DB) PMIDs
  if (newPmids.length > 0) {
    const importedEntries: SyncLogEntry[] = newPmids.map(id => ({
      pubmed_id:          id,
      event:              "imported" as const,
      fields_changed:     null,
      pubmed_modified_at: null,
    }));
    await flushLogs(importedEntries);
    console.log(`  ${newPmids.length} nye PMIDs logget som 'imported' (import-flow køres ikke herfra)\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`PubMed PMIDs i perioden:   ${pubmedIds.length.toLocaleString()}`);
  console.log(`Match i vores DB:          ${matches.length.toLocaleString()}`);
  console.log(`  Opdateret:               ${stats.updated}`);
  console.log(`  Retrakteret:             ${stats.retracted}`);
  console.log(`  Uændret:                 ${stats.unchanged}`);
  console.log(`Nye PMIDs (ikke i DB):     ${newPmids.length.toLocaleString()}`);
  console.log();
  console.log("Feltfordeling (ændrede):");
  console.log(`  title:             ${stats.fields.title}`);
  console.log(`  abstract:          ${stats.fields.abstract}`);
  console.log(`  mesh_terms:        ${stats.fields.mesh_terms}`);
  console.log(`  keywords:          ${stats.fields.keywords}`);
  console.log(`  publication_types: ${stats.fields.publication_types}`);
  console.log(`  authors:           ${stats.fields.authors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
