/**
 * pubmed-sync-test.ts
 *
 * Read-only diagnostic: finds articles in our DB that PubMed has modified
 * since our import and compares key fields (title, abstract, mesh_terms,
 * keywords, authors).
 *
 * Run from web/:
 *   npx tsx scripts/pubmed-sync-test.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

// ── Load .env.local ────────────────────────────────────────────────────────
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

// ── Config ─────────────────────────────────────────────────────────────────
const MDAT_MIN = "2026/03/03";
const MDAT_MAX = "2026/04/04";
const PUBMED_BATCH = 20;       // efetch batch size
const ESEARCH_RETMAX = 10000;  // max per esearch page
const RATE_MS = 150;           // pause between HTTP requests

// ── Clients ────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBMED_KEY   = process.env.PUBMED_API_KEY ?? "";
const BASE         = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── XML parser (same config as importer) ──────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => [
    "PubmedArticle", "Author", "AffiliationInfo",
    "AbstractText", "MeshHeading", "QualifierName", "Keyword", "PublicationType",
  ].includes(name),
});

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
  pubmedId: string;
  title: string;
  abstract: string;
  meshTerms: { descriptor: string; major: boolean; qualifiers: string[] }[];
  keywords: string[];
  authors: { lastName: string; foreName: string; affiliations: string[]; orcid: string | null }[];
  publicationTypes: string[];
}

interface DbArticle {
  pubmed_id: string;
  title: string | null;
  abstract: string | null;
  mesh_terms: unknown;
  keywords: unknown;
  authors: unknown;
  publication_types: unknown;
  pubmed_date: string | null;
}

interface Change {
  pubmedId: string;
  fields: string[];
  pubmedDate: string | null;
}

// ── Step 1: Fetch all pubmed_ids from DB ───────────────────────────────────
async function fetchDbIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGE = 1000;
  let page = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("articles")
      .select("pubmed_id")
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) if (row.pubmed_id) ids.add(row.pubmed_id);
    if (data.length < PAGE) break;
    page++;
  }
  return ids;
}

// ── Step 2a: Fetch C1 query strings from pubmed_filters ───────────────────
async function buildC1Query(): Promise<string> {
  const { data, error } = await supabase
    .from("pubmed_filters")
    .select("query_string, name")
    .eq("active", true)
    .eq("circle", 1);
  if (error) throw error;
  if (!data?.length) throw new Error("No active C1 filters found in pubmed_filters");

  console.log(`  Using ${data.length} C1 filters:`);
  for (const f of data) console.log(`    • ${f.name}`);

  return data.map(f => `(${f.query_string})`).join(" OR ");
}

// ── Step 2b: ESearch with mdat, paginated ─────────────────────────────────
async function esearch(query: string): Promise<string[]> {
  const all: string[] = [];
  let retstart = 0;

  for (;;) {
    const p = new URLSearchParams({
      db: "pubmed",
      term: query,
      datetype: "mdat",
      mindate: MDAT_MIN,
      maxdate: MDAT_MAX,
      retmax: String(ESEARCH_RETMAX),
      retstart: String(retstart),
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
    process.stdout.write(`\r  esearch: ${all.length.toLocaleString()} / ${total.toLocaleString()} PMIDs fetched`);

    if (retstart >= total || ids.length === 0) break;
    await sleep(RATE_MS);
  }

  return all;
}

// ── Step 4a: EFetch one batch, parse XML ──────────────────────────────────
function parseArticle(raw: Record<string, unknown>): PmArticle | null {
  try {
    const medline = raw.MedlineCitation as Record<string, unknown>;
    const pubmedId = getText(medline?.PMID);
    if (!pubmedId) return null;

    const article = medline?.Article as Record<string, unknown>;

    const title = getText(article?.ArticleTitle);

    const abstractNode = article?.Abstract as Record<string, unknown> | undefined;
    const abstract = toArr<unknown>(abstractNode?.AbstractText)
      .map(getText)
      .join(" ")
      .trim();

    const meshList = medline?.MeshHeadingList as Record<string, unknown> | undefined;
    const meshTerms = toArr<Record<string, unknown>>(meshList?.MeshHeading).map(h => {
      const desc = h.DescriptorName as Record<string, unknown> | undefined;
      return {
        descriptor: getText(desc),
        major: desc?.["@_MajorTopicYN"] === "Y",
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

    return { pubmedId, title, abstract, meshTerms, keywords, publicationTypes, authors };
  } catch {
    return null;
  }
}

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

// ── Normalizers for comparison ─────────────────────────────────────────────
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

// Normalize a single author to a comparable object.
// DB rows may use `affiliation` (singular string) or `affiliations` (array) — handle both.
// PubMed rows always have `affiliations` (array). Both sides are joined to a single
// lowercase string so the comparison is format-agnostic.
function normOneAffiliation(a: Record<string, unknown>): string {
  if (Array.isArray(a.affiliations) && a.affiliations.length > 0)
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

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== PubMed Sync Test ===");
  console.log(`Period: ${MDAT_MIN} → ${MDAT_MAX}\n`);

  // ── Step 1 ──────────────────────────────────────────────────────────────
  console.log("Step 1: Fetching pubmed_ids from DB…");
  const dbIds = await fetchDbIds();
  console.log(`  ${dbIds.size.toLocaleString()} articles in DB\n`);

  // ── Step 2 ──────────────────────────────────────────────────────────────
  console.log("Step 2: Loading C1 filters from pubmed_filters…");
  const c1Query = await buildC1Query();
  console.log();

  console.log("Step 2: Searching PubMed for mdat changes…");
  const pubmedIds = await esearch(c1Query);
  console.log(`\n  Total modified in period: ${pubmedIds.length.toLocaleString()}\n`);

  // ── Step 3 ──────────────────────────────────────────────────────────────
  console.log("Step 3: Cross-referencing with DB…");
  const matches = pubmedIds.filter(id => dbIds.has(id));
  console.log(`  Modified in PubMed:     ${pubmedIds.length.toLocaleString()}`);
  console.log(`  Match our DB:           ${matches.length.toLocaleString()}`);
  if (matches.length > 0) {
    const preview = matches.slice(0, 20).join(", ");
    const more   = matches.length > 20 ? ` … (+${matches.length - 20} more)` : "";
    console.log(`  Matching IDs:           ${preview}${more}`);
  }
  console.log();

  if (matches.length === 0) {
    console.log("No matches found — nothing to compare. Done.");
    return;
  }

  // ── Step 4 ──────────────────────────────────────────────────────────────
  console.log("Step 4: Fetching matched articles from DB…");
  const { data: dbRows, error: dbErr } = await supabase
    .from("articles")
    .select("pubmed_id, title, abstract, mesh_terms, keywords, publication_types, authors, pubmed_date")
    .in("pubmed_id", matches);
  if (dbErr) throw dbErr;

  const dbMap = new Map<string, DbArticle>(
    (dbRows ?? []).map(r => [r.pubmed_id, r as DbArticle])
  );
  console.log(`  ${dbMap.size} DB records loaded\n`);

  console.log("Step 4: Fetching from PubMed and comparing…");
  const changes: Change[] = [];
  const total = matches.length;

  for (let i = 0; i < total; i += PUBMED_BATCH) {
    const batch = matches.slice(i, i + PUBMED_BATCH);
    let fetched: PmArticle[];
    try {
      fetched = await efetchBatch(batch);
    } catch (e) {
      console.error(`\n  efetch error for batch at ${i}:`, e);
      continue;
    }

    for (const pm of fetched) {
      const row = dbMap.get(pm.pubmedId);
      if (!row) continue;

      const changed: string[] = [];

      if (normStr(row.title)    !== normStr(pm.title))           changed.push("title");
      if (normStr(row.abstract) !== normStr(pm.abstract))        changed.push("abstract");
      if (normMesh(row.mesh_terms) !== normMesh(pm.meshTerms))   changed.push("mesh_terms");
      if (normKeywords(row.keywords)           !== normKeywords(pm.keywords))           changed.push("keywords");
      if (normPubTypes(row.publication_types)  !== normPubTypes(pm.publicationTypes))   changed.push("publication_types");
      if (normAuthors(row.authors)             !== normAuthors(pm.authors))             changed.push("authors");

      if (changed.length > 0) {
        changes.push({ pubmedId: pm.pubmedId, fields: changed, pubmedDate: row.pubmed_date ?? null });
        console.log(`  [${pm.pubmedId}] changed: ${changed.join(", ")}`);
      }
    }

    if (i + PUBMED_BATCH < total) await sleep(RATE_MS);
    process.stdout.write(`\r  Progress: ${Math.min(i + PUBMED_BATCH, total)}/${total}`);
  }
  console.log("\n");

  // ── Summary ─────────────────────────────────────────────────────────────
  const counts: Record<string, number> = {
    title: 0, abstract: 0, mesh_terms: 0, keywords: 0, publication_types: 0, authors: 0,
  };
  for (const c of changes) for (const f of c.fields) counts[f]++;

  console.log("═══════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════");
  console.log(`PubMed modified in period: ${pubmedIds.length.toLocaleString()}`);
  console.log(`Matched in our DB:         ${matches.length.toLocaleString()}`);
  console.log(`Articles with changes:     ${changes.length.toLocaleString()}`);
  console.log();
  console.log(`  title changed:           ${counts.title}`);
  console.log(`  abstract changed:        ${counts.abstract}`);
  console.log(`  mesh_terms changed:      ${counts.mesh_terms}`);
  console.log(`  keywords changed:        ${counts.keywords}`);
  console.log(`  publication_types changed: ${counts.publication_types}`);
  console.log(`  authors changed:         ${counts.authors}`);

  // ── Age distribution ──────────────────────────────────────────────────────
  const now = new Date();

  // Helpers
  const ALL_FIELDS = ["title", "abstract", "mesh_terms", "keywords", "publication_types", "authors"];

  function fieldTally(subset: Change[]): string {
    const t: Record<string, number> = {};
    for (const c of subset) for (const f of c.fields) t[f] = (t[f] ?? 0) + 1;
    return ALL_FIELDS
      .filter(f => t[f])
      .map(f => `${f}:${t[f]}`)
      .join(", ") || "—";
  }

  // Sub-buckets for < 3 months (in weeks)
  const w0_2:  Change[] = [];
  const w2_4:  Change[] = [];
  const w4_8:  Change[] = [];
  const w8_12: Change[] = [];
  // Main buckets
  const m3_6:  Change[] = [];
  const m6_12: Change[] = [];
  const y1_2:  Change[] = [];
  const gt2y:  Change[] = [];
  const unknown: Change[] = [];

  for (const c of changes) {
    if (!c.pubmedDate) { unknown.push(c); continue; }
    const days = (now.getTime() - new Date(c.pubmedDate).getTime()) / 86_400_000;
    if      (days <  14)  w0_2.push(c);
    else if (days <  28)  w2_4.push(c);
    else if (days <  56)  w4_8.push(c);
    else if (days <  84)  w8_12.push(c);
    else if (days < 180)  m3_6.push(c);
    else if (days < 365)  m6_12.push(c);
    else if (days < 730)  y1_2.push(c);
    else                  gt2y.push(c);
  }

  if (changes.length > 0) {
    console.log("\nAge distribution of changed articles (by pubmed_date):");

    console.log(`\n  < 3 måneder  (${w0_2.length + w2_4.length + w4_8.length + w8_12.length} artikler)`);
    console.log(`    0–2 uger:   ${w0_2.length.toString().padStart(4)}  [${fieldTally(w0_2)}]`);
    console.log(`    2–4 uger:   ${w2_4.length.toString().padStart(4)}  [${fieldTally(w2_4)}]`);
    console.log(`    4–8 uger:   ${w4_8.length.toString().padStart(4)}  [${fieldTally(w4_8)}]`);
    console.log(`    8–12 uger:  ${w8_12.length.toString().padStart(4)}  [${fieldTally(w8_12)}]`);

    console.log(`\n  3–6 måneder: ${m3_6.length.toString().padStart(4)}  [${fieldTally(m3_6)}]`);
    console.log(`  6–12 måneder:${m6_12.length.toString().padStart(4)}  [${fieldTally(m6_12)}]`);

    console.log(`\n  1–2 år       (${y1_2.length} artikler)`);
    if (y1_2.length > 0) {
      const meshOnly   = y1_2.filter(c => c.fields.every(f => f === "mesh_terms" || f === "keywords" || f === "publication_types"));
      const withContent = y1_2.filter(c => c.fields.includes("abstract") || c.fields.includes("authors") || c.fields.includes("title"));
      console.log(`    feltfordeling:     [${fieldTally(y1_2)}]`);
      console.log(`    kun MeSH/kw/pt:    ${meshOnly.length}  (sandsynlig Year-End Processing)`);
      console.log(`    med abstract/authors/title: ${withContent.length}`);
    }

    console.log(`\n  > 2 år:      ${gt2y.length.toString().padStart(4)}  [${fieldTally(gt2y)}]`);
    if (unknown.length > 0)
      console.log(`  ukendt dato: ${unknown.length.toString().padStart(4)}`);
  }

  if (changes.length > 0) {
    console.log("\nAll changed pubmed_ids:");
    for (const c of changes) {
      console.log(`  ${c.pubmedId}  [${c.fields.join(", ")}]`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
