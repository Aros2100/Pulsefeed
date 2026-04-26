/**
 * debug-abstract-parsing.ts
 *
 * Investigates 24 data_loss cases: DB abstract IS NULL but raw_xml has content.
 * Tests three hypotheses for each PMID:
 *   Test 1 — re-parse stored raw_xml (same parser path as fetchArticleDetails)
 *   Test 2 — live PubMed EFetch
 *   Test 3 — current DB value
 *
 * Run:
 *   cd web && npx tsx scripts/debug-abstract-parsing.ts
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchArticleDetails } from "@/lib/import/article-import/fetcher";
import { XMLParser } from "fast-xml-parser";

// ── Target PMIDs ───────────────────────────────────────────────────────────────

const PMIDS = ["41981224", "41973299", "41963884", "41964774", "41964856"];

// ── XMLParser config — identical to fetchArticleDetails ───────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: false,
  isArray: (name) =>
    [
      "PubmedArticle",
      "Author",
      "AffiliationInfo",
      "Identifier",
      "ArticleId",
      "AbstractText",
      "MeshHeading",
      "QualifierName",
      "Grant",
      "Chemical",
      "Keyword",
      "PublicationType",
      "ELocationID",
      "ISSN",
      "PubMedPubDate",
    ].includes(name),
});

function getText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function extractAbstract(articleXml: string): { abstract: string | null; rawAbstractText: unknown } {
  // Wrap in PubmedArticleSet — same structure as EFetch response
  const wrapped = `<?xml version="1.0" encoding="utf-8"?><PubmedArticleSet>${articleXml}</PubmedArticleSet>`;

  const parsed = parser.parse(wrapped) as {
    PubmedArticleSet?: { PubmedArticle?: Record<string, unknown>[] };
  };

  const articles = parsed.PubmedArticleSet?.PubmedArticle ?? [];
  const article  = articles[0];
  if (!article) return { abstract: null, rawAbstractText: null };

  const citation  = article.MedlineCitation as Record<string, unknown> | undefined;
  const art       = citation?.Article      as Record<string, unknown> | undefined;
  const abstractN = art?.Abstract          as Record<string, unknown> | undefined;
  const rawAbstractText = abstractN?.AbstractText;

  const abstractParts = toArray(rawAbstractText);
  const abstract =
    abstractParts.length > 0
      ? decodeHtmlEntities(
          abstractParts
            .map((part) => {
              const p     = part as Record<string, unknown>;
              const label = p["@_Label"] as string | undefined;
              const text  = getText(part);
              return label ? `${label}: ${text}` : text;
            })
            .filter(Boolean)
            .join("\n\n")
        )
      : null;

  return { abstract, rawAbstractText };
}

function trunc(s: string | null, n = 100): string {
  if (s === null) return "null";
  if (s.length <= n) return JSON.stringify(s);
  return JSON.stringify(s.slice(0, n)) + "…";
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  debug-abstract-parsing.ts");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Collect results
  const rows: {
    pmid:       string;
    db:         string;
    reparse:    string;
    live:       string;
    rawPreview: string;
  }[] = [];

  let dumpedRaw = false;

  for (const pmid of PMIDS) {
    console.log(`\n── PMID ${pmid} ──────────────────────────────────────────`);

    // ── Test 3: DB value ──────────────────────────────────────────────────────
    const { data: artRows } = await a
      .from("articles")
      .select("abstract")
      .eq("pubmed_id", pmid)
      .limit(1);
    const dbAbstract = (artRows?.[0]?.abstract ?? null) as string | null;
    console.log(`  [DB]        ${trunc(dbAbstract)}`);

    // ── Test 1: Re-parse stored raw_xml ───────────────────────────────────────
    const { data: rawRows } = await a
      .from("article_pubmed_raw")
      .select("raw_xml, fetched_at")
      .eq("pubmed_id", pmid)
      .order("fetched_at", { ascending: false })
      .limit(1);

    let reparseAbstract: string | null = null;
    let rawAbstractText: unknown       = null;

    if (rawRows && rawRows.length > 0) {
      const { raw_xml, fetched_at } = rawRows[0] as { raw_xml: string; fetched_at: string };
      console.log(`  [raw_xml]   fetched_at=${fetched_at}, length=${raw_xml.length} chars`);

      const result = extractAbstract(raw_xml);
      reparseAbstract  = result.abstract;
      rawAbstractText  = result.rawAbstractText;
      console.log(`  [Re-parse]  ${trunc(reparseAbstract)}`);

      // Dump raw AbstractText structure once
      if (!dumpedRaw) {
        dumpedRaw = true;
        const dump = JSON.stringify(rawAbstractText, null, 2);
        console.log(`\n  ── Raw AbstractText structure (first 500 chars) ──`);
        console.log(dump.slice(0, 500));
        if (dump.length > 500) console.log("  … (truncated)");
        console.log();
      }
    } else {
      console.log(`  [raw_xml]   NOT FOUND in article_pubmed_raw`);
      console.log(`  [Re-parse]  n/a`);
    }

    // ── Test 2: Live PubMed fetch ─────────────────────────────────────────────
    let liveAbstract: string | null = null;
    try {
      const { articles } = await fetchArticleDetails([pmid]);
      const found = articles.find((a) => a.pubmedId === pmid);
      liveAbstract = found?.abstract ?? null;
      console.log(`  [Live]      ${trunc(liveAbstract)}`);
    } catch (e) {
      console.log(`  [Live]      ERROR: ${String(e)}`);
      liveAbstract = `ERROR: ${String(e)}`;
    }

    rows.push({
      pmid,
      db:         dbAbstract    === null ? "NULL" : `"${dbAbstract.slice(0, 60)}…"`,
      reparse:    reparseAbstract === null ? "NULL" : `"${reparseAbstract.slice(0, 60)}…"`,
      live:       liveAbstract  === null ? "NULL" : typeof liveAbstract === "string" && liveAbstract.startsWith("ERROR") ? liveAbstract : `"${liveAbstract.slice(0, 60)}…"`,
      rawPreview: rawAbstractText === undefined ? "no raw_xml" : rawAbstractText === null ? "AbstractText=null in XML" : "present",
    });
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY TABLE");
  console.log("══════════════════════════════════════════════════════════════\n");

  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  const header = `${col("PMID", 12)} | ${col("DB", 8)} | ${col("Re-parse (stored XML)", 30)} | ${col("Live PubMed", 30)} | ${col("raw AbstractText", 26)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of rows) {
    console.log(
      `${col(r.pmid, 12)} | ${col(r.db === "NULL" ? "NULL" : "has val", 8)} | ${col(r.reparse === "NULL" ? "NULL" : "has val", 30)} | ${col(r.live === "NULL" ? "NULL" : r.live.startsWith("ERROR") ? r.live.slice(0, 28) : "has val", 30)} | ${r.rawPreview}`
    );
  }

  console.log("\n── Interpretation ───────────────────────────────────────────");
  const allReparseNull = rows.every((r) => r.reparse === "NULL");
  const allLiveHasVal  = rows.every((r) => r.live !== "NULL" && !r.live.startsWith("ERROR"));
  const allReparseHasVal = rows.every((r) => r.reparse !== "NULL");

  if (allReparseHasVal && allLiveHasVal) {
    console.log("  → Re-parse SUCCEEDS and live SUCCEEDS.");
    console.log("    Bug is NOT in parser. PubMed data changed after original import.");
    console.log("    DB null abstracts are from import-time — PubMed 'In-Process' articles had no abstract yet.");
  } else if (allReparseNull && allLiveHasVal) {
    console.log("  → Re-parse NULL but live has value.");
    console.log("    The stored raw_xml is defective (missing Abstract). Import stored wrong XML.");
  } else if (allReparseNull && !allLiveHasVal) {
    console.log("  → Both re-parse and live return NULL.");
    console.log("    Parser bug, OR PubMed still has no abstract for these articles.");
  } else {
    console.log("  → Mixed results — check per-PMID output above for details.");
  }
  console.log();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
