import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWorkByDoi, fetchWorkById } from "@/lib/openalex/client";
import { determineArticleGeo } from "@/lib/import/author-import/find-or-create";
import type { Author } from "@/lib/import/article-import/fetcher";
import type { OpenAlexAuthorship } from "@/lib/openalex/client";
import pLimit from "p-limit";

const MAX_ARTICLES = 200;
const MAX_ERROR_RATE = 0.2; // 20%
const OA_CONCURRENCY = 5;

interface ArticleRow {
  id: string;
  doi: string | null;
  openalex_work_id: string | null;
  authors: unknown;
  geo_department: string | null;
  geo_institution: string | null;
  geo_city: string | null;
  geo_state: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_continent: string | null;
  geo_parser_confidence: string | null;
}

export interface DryRunResult {
  runId: string;
  previewed: number;
  errors: string[];
}

export async function runGeoBackfillDryRun(n = MAX_ARTICLES): Promise<DryRunResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const runId = crypto.randomUUID();
  const errors: string[] = [];

  // ── Sample articles: stratified by OA/DOI availability ─────────────────────
  // Group 1: ~90% with openalex_work_id (OA data already cached)
  // Group 2: ~7.5% doi only (no OA cached, needs fetch)
  // Group 3: ~2.5% neither (parser_pubmed only path)
  const group1Count = Math.round(n * 0.9);
  const group2Count = Math.round(n * 0.075);
  const group3Count = n - group1Count - group2Count;

  const SELECT_COLS = "id, doi, openalex_work_id, authors, geo_department, geo_institution, geo_city, geo_state, geo_country, geo_region, geo_continent, geo_parser_confidence";

  const [g1Res, g2Res, g3Res] = await Promise.all([
    a.from("articles").select(SELECT_COLS).not("openalex_work_id", "is", null).limit(group1Count * 10),
    a.from("articles").select(SELECT_COLS).is("openalex_work_id", null).not("doi", "is", null).limit(group2Count * 10),
    a.from("articles").select(SELECT_COLS).is("openalex_work_id", null).is("doi", null).limit(group3Count * 10),
  ]);

  function pickRandom<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  const articles: ArticleRow[] = [
    ...pickRandom((g1Res.data ?? []) as ArticleRow[], group1Count),
    ...pickRandom((g2Res.data ?? []) as ArticleRow[], group2Count),
    ...pickRandom((g3Res.data ?? []) as ArticleRow[], group3Count),
  ];

  if (articles.length === 0) {
    return { runId, previewed: 0, errors: ["No articles found"] };
  }

  const limit = pLimit(OA_CONCURRENCY);
  let processed = 0;

  const previewRows: Record<string, unknown>[] = [];

  await Promise.all(
    articles.map((article) =>
      limit(async () => {
        // Hard stop: abort if error rate exceeds threshold
        if (errors.length > Math.ceil(articles.length * MAX_ERROR_RATE)) return;

        try {
          // ── First author ─────────────────────────────────────────────────────
          const rawAuthors = (article.authors ?? []) as Record<string, unknown>[];
          const rawFirst = rawAuthors[0] ?? null;
          const firstAuthor: Author = {
            lastName:     String(rawFirst?.lastName ?? ""),
            foreName:     String(rawFirst?.foreName ?? ""),
            affiliations: Array.isArray(rawFirst?.affiliations)
              ? (rawFirst!.affiliations as string[])
              : rawFirst?.affiliation != null ? [String(rawFirst.affiliation)] : [],
            orcid:        rawFirst?.orcid != null ? String(rawFirst.orcid) : null,
          };

          // ── OpenAlex work ────────────────────────────────────────────────────
          let oaWork = null;
          let hadCached = false;
          let oaFetched = false;

          if (article.openalex_work_id) {
            hadCached = true;
            oaWork = await fetchWorkById(article.openalex_work_id);
            oaFetched = oaWork != null;
          } else if (article.doi) {
            oaWork = await fetchWorkByDoi(article.doi);
            oaFetched = oaWork != null;
          }

          const firstOaAuthorship: OpenAlexAuthorship | null =
            oaWork?.authorships[0] ?? null;

          // ── Diagnostics ──────────────────────────────────────────────────────
          const primaryInst = firstOaAuthorship?.institutions[0] ?? null;
          const rorLookupAttempted = Boolean(primaryInst?.ror);

          // ── Determine new geo ────────────────────────────────────────────────
          const newGeo = await determineArticleGeo(admin, firstAuthor, firstOaAuthorship);

          const rorLookupSucceeded =
            rorLookupAttempted && newGeo.geo_source === "ror_enriched";
          const parserFallbackUsed =
            newGeo.geo_source === "parser_openalex" ||
            newGeo.geo_source === "parser_pubmed";

          previewRows.push({
            article_id: article.id,
            run_id: runId,

            old_geo_department:       article.geo_department,
            old_geo_institution:      article.geo_institution,
            old_geo_city:             article.geo_city,
            old_geo_state:            article.geo_state,
            old_geo_country:          article.geo_country,
            old_geo_region:           article.geo_region,
            old_geo_continent:        article.geo_continent,
            old_geo_parser_confidence: article.geo_parser_confidence,

            new_geo_department:       newGeo.geo_department,
            new_geo_institution:      newGeo.geo_institution,
            new_geo_city:             newGeo.geo_city,
            new_geo_state:            newGeo.geo_state,
            new_geo_country:          newGeo.geo_country,
            new_geo_region:           newGeo.geo_region,
            new_geo_continent:        newGeo.geo_continent,
            new_geo_source:           newGeo.geo_source,
            new_geo_parser_confidence: newGeo.parser_confidence,

            had_openalex_cached:   hadCached,
            openalex_fetched:      oaFetched,
            ror_lookup_attempted:  rorLookupAttempted,
            ror_lookup_succeeded:  rorLookupSucceeded,
            parser_fallback_used:  parserFallbackUsed,
          });
        } catch (e) {
          errors.push(`Article ${article.id}: ${e instanceof Error ? e.message : String(e)}`);
        }

        processed++;
      })
    )
  );

  // ── Bulk insert preview rows ─────────────────────────────────────────────────
  if (previewRows.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < previewRows.length; i += CHUNK) {
      const { error } = await a
        .from("geo_backfill_preview")
        .insert(previewRows.slice(i, i + CHUNK));
      if (error) {
        errors.push(`Insert error (chunk ${i / CHUNK}): ${error.message}`);
      }
    }
  }

  return { runId, previewed: previewRows.length, errors };
}
