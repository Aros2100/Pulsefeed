import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPubMedIds, fetchArticleDetails, sleep } from "@/lib/import/article-import/fetcher";
import { saveRawXml } from "@/lib/import/article-import/raw-writer";
import { runArticleChecks } from "@/lib/import/quality-checks";
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
 * Circle 4 import pipeline — MeSH Terms based:
 *   1. Fetch active filters with circle = 4
 *   2. Build query from mesh_list: "Term"[MeSH Terms] OR ...
 *   3. ESearch → PMIDs
 *   4. Dedupe against existing articles
 *   5. EFetch details
 *   6. Upsert with circle=4, approval_method="mesh", status="approved"
 *   7. Log article events
 *   8. Update last_run_at + finalise import_log
 */
export async function runImportCircle4(
  filterId?: string,
  force = false,
  existingLogId?: string,
  trigger: "cron" | "manual" = "cron",
  reldate?: number,
  mindate?: string,
  maxdate?: string,
): Promise<ImportResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let totalAuthorSlots = 0;

  // 1. Load C4 filters
  let q = admin.from("pubmed_filters").select("*").eq("active", true).eq("circle", 4);
  if (filterId) q = q.eq("id", filterId);

  const { data: filters, error: filtersErr } = await q;
  if (filtersErr) throw new Error(`Failed to fetch filters: ${filtersErr.message}`);

  if (!filters?.length) {
    return {
      logId: existingLogId ?? null,
      imported: 0,
      skipped: 0,
      errors: ["No active C4 filters found"],
    };
  }

  const globalLogId = existingLogId ?? null;
  let logId = globalLogId;

  for (const filter of filters) {
    if (!filter.specialty || String(filter.specialty).trim() === "") {
      const msg = `Filter "${filter.name}" (${filter.id}) has no specialty — skipping`;
      console.error(`[import-c4] ${msg}`);
      errors.push(msg);
      continue;
    }
    const specialty = String(filter.specialty).trim();

    let filterLogId = globalLogId;
    if (!filterLogId) {
      const { data: filterLog } = await admin
        .from("import_logs")
        .insert({ filter_id: filter.id, status: "running", trigger, circle: 4 })
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

      const { pmids, totalCount } = await fetchPubMedIds(filter.query_string, filter.max_results ?? 500, reldate, mindate, maxdate);
      if (totalCount > pmids.length) {
        console.error(`[import] ESearch returned ${totalCount} total hits but retmax=${filter.max_results ?? 500} — ${totalCount - pmids.length} articles not fetched`);
      }
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
        const { articles, rawXml } = await fetchArticleDetails(newPmids);

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
            circle:            4,
            approval_method:   "mesh",
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
            filterErrors.push(`Upsert batch error: ${upsertErr.message}`);
            errors.push(`Upsert batch error: ${upsertErr.message}`);
          } else {
            filterImported += (upsertedRows ?? []).length;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const auths = (a.authors as unknown as unknown[]) ?? [];
              return sum + auths.length;
            }, 0);

            void Promise.all(
              (upsertedRows ?? []).map((row) =>
                logArticleEvent(row.id, "imported", buildImportEventPayload({
                  circle: 4,
                  status: "approved",
                  approval_method: "mesh",
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
                source:          'c4_filter',
                scored_by:       'c4_filter',
                scored_at:       new Date().toISOString(),
              }));
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin as any)
                .from('article_specialties')
                .upsert(specialtyRows, { onConflict: 'article_id,specialty', ignoreDuplicates: true });

              void saveRawXml(
                admin,
                upsertedRows
                  .filter((row) => rawXml.has(row.pubmed_id))
                  .map((row) => ({ articleId: row.id, pubmedId: row.pubmed_id, rawXml: rawXml.get(row.pubmed_id)! })),
                "import"
              );
            }
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
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
      const { error: finalizeErr } = await admin
        .from("import_logs")
        .update({
          status: filterErrors.length > 0 && filterImported === 0 ? "failed" : "completed",
          articles_fetched: filterFetched,
          articles_imported: filterImported,
          articles_skipped: filterSkipped,
          author_slots_imported: totalAuthorSlots,
          errors: filterErrors.length > 0 ? filterErrors : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", filterLogId);
      if (finalizeErr) {
        console.error(`[import-c4] Failed to finalize log ${filterLogId}:`, finalizeErr.message);
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
            `[import-c4] Article checks failed for filter "${filter.name}" (${filterLogId}): ` +
            qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
          );
        }
      } catch (qcErr) {
        console.warn(`[import-c4] Article checks threw for ${filterLogId}:`, qcErr);
      }
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
