import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPubMedIds, fetchArticleDetails, sleep } from "@/lib/artikel-import/fetcher";
import { runArticleChecks } from "@/lib/pubmed/quality-checks";
import { logArticleEvent } from "@/lib/article-events";
import { buildImportEventPayload } from "@/lib/article-events/import-payload";

const BATCH_SIZE = 20;
const RATE_LIMIT_MS = 110;

export interface ImportResult {
  logId: string | null;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Full import pipeline:
 *   1. Fetch active filters (or a specific one)
 *   2. ESearch → PMIDs
 *   3. Dedupe against existing articles (unless force=true)
 *   4. EFetch details
 *   5. Upsert — DB trigger merges specialty_tags on conflict
 *   6. Update import_logs
 */
export async function runImport(
  filterId?: string,
  force = false,
  existingLogId?: string,
  trigger: "cron" | "manual" = "cron"
): Promise<ImportResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let totalAuthorSlots = 0;

  // 1. Load filters — eksplicit circle != 2 så C2-filtre ikke kører som C1
  let q = admin.from("pubmed_filters").select("*").eq("active", true).neq("circle", 2);
  if (filterId) q = q.eq("id", filterId);

  const { data: filters, error: filtersErr } = await q;
  if (filtersErr) throw new Error(`Failed to fetch filters: ${filtersErr.message}`);

  if (!filters?.length) {
    return {
      logId: existingLogId ?? null,
      imported: 0,
      skipped: 0,
      errors: ["No active filters found"],
    };
  }

  // 2. Each filter gets its own log row
  const globalLogId = existingLogId ?? null;
  let logId = globalLogId;

  for (const filter of filters) {
    if (!filter.specialty || String(filter.specialty).trim() === "") {
      const msg = `Filter "${filter.name}" (${filter.id}) has no specialty — skipping to avoid empty specialty_tags`;
      console.error(`[import] ${msg}`);
      errors.push(msg);
      continue;
    }
    const specialty = String(filter.specialty).trim();

    let filterLogId = globalLogId;
    if (!filterLogId) {
      const { data: filterLog } = await admin
        .from("import_logs")
        .insert({ filter_id: filter.id, status: "running", trigger })
        .select("id")
        .single();
      filterLogId = filterLog?.id ?? null;
      logId = filterLogId;
    }

    let filterImported = 0;
    let filterFetched = 0;
    let filterSkipped = 0;
    const filterErrors: string[] = [];

    try {
      await sleep(RATE_LIMIT_MS);

      const tSearch = Date.now();
      const pmids = await fetchPubMedIds(filter.query_string, filter.max_results ?? 100);
      console.error(`[import] fetchPubMedIds: ${Date.now() - tSearch}ms`);
      filterFetched = pmids.length;
      if (!pmids.length) continue;

      let newPmids = pmids;
      if (!force) {
        const DEDUP_CHUNK = 500;
        const existingSet = new Set<string>();
        for (let d = 0; d < pmids.length; d += DEDUP_CHUNK) {
          const chunk = pmids.slice(d, d + DEDUP_CHUNK);
          const { data: existing, error: dedupErr } = await admin
            .from("articles")
            .select("pubmed_id")
            .in("pubmed_id", chunk);
          if (dedupErr) throw new Error(`Dedup query failed: ${dedupErr.message}`);
          for (const r of existing ?? []) existingSet.add(r.pubmed_id);
        }
        newPmids = pmids.filter((id) => !existingSet.has(id));
        filterSkipped = pmids.length - newPmids.length;
      }

      if (newPmids.length > 0) {
        const tFetch = Date.now();
        const articles = await fetchArticleDetails(newPmids);
        console.error(`[import] fetchArticleDetails (${articles.length} articles): ${Date.now() - tFetch}ms`);

        const tUpsert = Date.now();
        for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          const batch = articles.slice(i, i + BATCH_SIZE).map((a) => ({
            pubmed_id:         a.pubmedId,
            doi:               a.doi,
            pmc_id:            a.pmcId,
            title:             a.title,
            abstract:          a.abstract,
            language:          a.language,
            publication_types: a.publicationTypes,
            mesh_terms:        a.meshTerms as unknown as import("@/lib/supabase/types").Json,
            keywords:          a.keywords,
            coi_statement:     a.coiStatement,
            grants:            a.grants as unknown as import("@/lib/supabase/types").Json,
            substances:        a.substances as unknown as import("@/lib/supabase/types").Json,
            journal_abbr:      a.journalAbbr,
            journal_title:     a.journalTitle,
            published_year:    a.publishedYear,
            published_date:    a.publishedDate,
            date_completed:    a.dateCompleted,
            volume:            a.volume,
            issue:             a.issue,
            authors:           a.authors as unknown as import("@/lib/supabase/types").Json,
            article_number:    a.articleNumber,
            pubmed_date:       a.pubmedDate,
            pubmed_indexed_at: a.pubmedIndexedAt,
            issn_electronic:   a.issnElectronic,
            issn_print:        a.issnPrint,
            specialty_tags:    [specialty],
            circle:            1,
            approval_method:   "journal",
            status:            "approved",
          }));

          const invalid = batch.filter(
            (row) => !row.specialty_tags || row.specialty_tags.length === 0 || !row.specialty_tags[0]
          );
          if (invalid.length > 0) {
            throw new Error(
              `${invalid.length} article(s) would be inserted with empty specialty_tags — aborting batch. PMIDs: ${invalid.map((r) => r.pubmed_id).join(", ")}`
            );
          }

          const { data: upsertedRows, error: upsertErr } = await admin
            .from("articles")
            .upsert(batch, { onConflict: "pubmed_id", ignoreDuplicates: true })
            .select("id, pubmed_id");

          if (upsertErr) {
            errors.push(`Upsert batch error: ${upsertErr.message}`);
          } else {
            filterImported += (upsertedRows ?? []).length;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const authors = (a.authors as unknown as unknown[]) ?? [];
              return sum + authors.length;
            }, 0);

            void Promise.all(
              (upsertedRows ?? []).map((row) =>
                logArticleEvent(row.id, "imported", buildImportEventPayload({
                  circle: 1,
                  status: "approved",
                  approval_method: "journal",
                  specialty_tags: [specialty],
                  pubmed_id: row.pubmed_id,
                  import_log_id: filterLogId,
                  source_id: null,
                }))
              )
            );

            if (upsertedRows && upsertedRows.length > 0) {
              const specialtyRows = upsertedRows.map((row) => ({
                article_id:      row.id,
                specialty:       specialty,
                specialty_match: true,
                source:          'c1_filter',
                scored_by:       'c1_filter',
                scored_at:       new Date().toISOString(),
              }));
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin as any)
                .from('article_specialties')
                .upsert(specialtyRows, { onConflict: 'article_id,specialty', ignoreDuplicates: true });
            }
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
        console.error(`[import] upsert batch: ${Date.now() - tUpsert}ms`);
      }

      await admin
        .from("pubmed_filters")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", filter.id);
    } catch (err) {
      const msg = `Filter "${filter.name}": ${err instanceof Error ? err.message : String(err)}`;
      filterErrors.push(msg);
      errors.push(msg);
    }

    if (filterLogId) {
      const finalizePayload = {
        status: filterErrors.length > 0 && filterImported === 0 ? "failed" : "completed",
        articles_fetched: filterFetched,
        articles_imported: filterImported,
        articles_skipped: filterSkipped,
        author_slots_imported: totalAuthorSlots,
        errors: filterErrors.length > 0 ? filterErrors : null,
        completed_at: new Date().toISOString(),
      };
      console.error(`[import] finalizing log ${filterLogId}:`, JSON.stringify(finalizePayload));
      const { error: finalizeErr } = await admin
        .from("import_logs")
        .update(finalizePayload)
        .eq("id", filterLogId);
      if (finalizeErr) {
        console.error(`[import] Failed to finalize log ${filterLogId}:`, finalizeErr.message);
      }
    }

    totalFetched   += filterFetched;
    totalImported  += filterImported;
    totalSkipped   += filterSkipped;

    if (filterLogId) {
      try {
        const qc = await runArticleChecks(filterLogId);
        if (!qc.passed) {
          console.warn(
            `[import] Article checks failed for filter "${filter.name}" (${filterLogId}): ` +
            `${qc.failedChecks}/${qc.totalChecks} checks failed — ` +
            qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
          );
        }
      } catch (qcErr) {
        console.warn(`[import] Article checks threw for ${filterLogId}:`, qcErr);
      }
    }
  }

  if (totalImported > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: normRows, error: normErr } = await (admin as any).rpc("normalize_geo_city");
      if (normErr) {
        console.error("[import] normalize_geo_city failed:", normErr.message);
      } else {
        console.error(`[import] normalize_geo_city: ${normRows ?? 0} rows updated`);
      }
    } catch (normErr) {
      console.error("[import] normalize_geo_city threw:", normErr);
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
