import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPubMedIds, fetchArticleDetails } from "./importer";
import { runArticleChecks } from "@/lib/pubmed/quality-checks";
import { logArticleEvent } from "@/lib/article-events";
import type { Json } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createAdminClient>;

const BATCH_SIZE = 20;
const RATE_LIMIT_MS = 110;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds a PubMed query for Danish institutional sources.
 *
 * Each value is a plain location or hospital name — no PubMed syntax needed.
 * The function always produces:
 *
 *   "Copenhagen"  →  ("Copenhagen"[AD] AND neurosurg*[AD])
 *   "Rigshospitalet"  →  ("Rigshospitalet"[AD] AND neurosurg*[AD])
 *
 * All clauses joined with OR.
 */
function buildC3Query(terms: string[]): string {
  return terms
    .map((t) => `("${t.trim()}"[AD] AND neurosurg*[AD])`)
    .join(" OR ");
}

export interface Circle3ImportResult {
  logId: string | null;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Circle 3 import pipeline — Danish institutional affiliations:
 *   1. Load active sources from circle_3_sources
 *   2. Build combined OR query from all affiliation terms
 *   3. ESearch → PMIDs
 *   4. Deduplicate against existing articles (any circle)
 *   5. EFetch details
 *   6. Upsert with circle=3, verified=true, status='approved', country='Denmark'
 *   7. Log article events
 *   8. Update last_run_at + finalise import_log
 */
export async function runImportCircle3(
  existingLogId?: string,
  trigger: "cron" | "manual" = "cron"
): Promise<Circle3ImportResult> {
  const admin: AdminClient = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let totalAuthorSlots = 0;

  // Log-rækken oprettes normalt af kalderen — fallback her hvis ingen logId givet
  let logId = existingLogId ?? null;
  if (!logId) {
    const { data: newLog } = await db
      .from("import_logs")
      .insert({ filter_id: null, status: "running", trigger, circle: 3 })
      .select("id")
      .single() as { data: { id: string } | null; error: unknown };
    logId = (newLog as { id: string } | null)?.id ?? null;
  }

  // 1. Load active affiliation sources
  const { data: sources, error: sourcesErr } = await db
    .from("circle_3_sources")
    .select("id, value, max_results")
    .eq("active", true) as { data: { id: string; value: string; max_results: number | null }[] | null; error: { message: string } | null };

  if (sourcesErr) {
    if (logId) {
      await admin.from("import_logs").update({
        status: "failed",
        errors: [`Failed to fetch sources: ${sourcesErr.message}`],
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return { logId, imported: 0, skipped: 0, errors: [`Failed to fetch sources: ${sourcesErr.message}`] };
  }

  if (!sources?.length) {
    if (logId) {
      await admin.from("import_logs").update({
        status: "failed",
        articles_imported: 0,
        articles_skipped: 0,
        errors: ["No active Circle 3 sources found"],
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return { logId, imported: 0, skipped: 0, errors: ["No active Circle 3 sources found"] };
  }

  try {
    // 2. Build combined query
    const terms = sources.map((s) => s.value);
    const query = buildC3Query(terms);
    const maxResults = Math.max(...sources.map((s) => s.max_results ?? 500));

    await sleep(RATE_LIMIT_MS);

    // 3. ESearch
    const pmids = await fetchPubMedIds(query, maxResults);
    totalFetched = pmids.length;

    if (pmids.length > 0) {
      // 4. Deduplicate — chunk the IN query (Supabase default 1000-row limit + URL length)
      const DEDUP_CHUNK = 500;
      const existingPmidsList: string[] = [];
      for (let i = 0; i < pmids.length; i += DEDUP_CHUNK) {
        const { data } = await admin
          .from("articles")
          .select("pubmed_id")
          .in("pubmed_id", pmids.slice(i, i + DEDUP_CHUNK))
          .limit(DEDUP_CHUNK);
        existingPmidsList.push(...(data?.map((r) => r.pubmed_id) ?? []));
      }
      const existingSet = new Set(existingPmidsList);
      const newPmids = pmids.filter((id) => !existingSet.has(id));
      totalSkipped = pmids.length - newPmids.length;

      if (newPmids.length > 0) {
        // 5. EFetch
        const fetched = await fetchArticleDetails(newPmids);

        // 5b. Verify neurosurgical affiliation locally — PubMed [AD] matching is
        //     not always precise and can match neurosurg* and a Danish hospital
        //     name on DIFFERENT authors. Both conditions must appear on the SAME
        //     author's affiliation string to qualify for circle 3.
        const danishHospitals = sources.map((s) => s.value);
        const danishPattern   = new RegExp(
          danishHospitals.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
          "i"
        );
        const articles = fetched.filter((a) =>
          (a.authors as Array<{ affiliation?: string | null }>).some((au) => {
            const aff = au.affiliation ?? "";
            return /neurosurg/i.test(aff) && danishPattern.test(aff);
          })
        );
        const filteredOut = fetched.length - articles.length;
        if (filteredOut > 0) {
          totalSkipped += filteredOut;
          console.log(`[import-circle3] Filtered ${filteredOut} articles lacking co-located neurosurg+Danish-hospital affiliation`);
        }

        // 6 + 7. Upsert + log events
        for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          const batch = articles.slice(i, i + BATCH_SIZE).map((a) => ({
            pubmed_id:         a.pubmedId,
            doi:               a.doi,
            pmc_id:            a.pmcId,
            title:             a.title,
            abstract:          a.abstract,
            language:          a.language,
            publication_types: a.publicationTypes,
            mesh_terms:        a.meshTerms        as unknown as Json,
            keywords:          a.keywords,
            coi_statement:     a.coiStatement,
            grants:            a.grants           as unknown as Json,
            substances:        a.substances       as unknown as Json,
            journal_abbr:      a.journalAbbr,
            journal_title:     a.journalTitle,
            published_year:    a.publishedYear,
            published_date:    a.publishedDate,
            date_completed:    a.dateCompleted,
            volume:            a.volume,
            issue:             a.issue,
            authors:           a.authors          as unknown as Json,
            article_number:    a.articleNumber,
            pubmed_date:       a.pubmedDate,
            pubmed_indexed_at: a.pubmedIndexedAt,
            issn_electronic:   a.issnElectronic,
            issn_print:        a.issnPrint,
            specialty_tags:    ["neurosurgery"],
            circle:            3,
            verified:          false,
            status:            "pending",
            country:           "Denmark",
          }));

          // ON CONFLICT (pubmed_id) DO NOTHING — never overwrite existing articles
          const { data: upsertedRows, error: upsertErr } = await admin
            .from("articles")
            .upsert(batch as never, { onConflict: "pubmed_id", ignoreDuplicates: true })
            .select("id, pubmed_id");

          if (upsertErr) {
            errors.push(`Upsert batch error: ${upsertErr.message}`);
          } else {
            const inserted = (upsertedRows ?? []).length;
            // Belt-and-suspenders: any batch rows not returned were DB-level duplicates
            // that escaped the pre-fetch dedup (e.g. race condition or chunking gap)
            totalSkipped   += batch.length - inserted;
            totalImported  += inserted;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const authors = (a.authors as unknown as unknown[]) ?? [];
              return sum + authors.length;
            }, 0);

            void Promise.all(
              (upsertedRows ?? []).map((row) =>
                logArticleEvent(row.id, "imported", {
                  circle: 3,
                  status: "pending",
                  specialty_tags: ["neurosurgery"],
                  pubmed_id: row.pubmed_id,
                  import_log_id: logId,
                  country: "Denmark",
                })
              )
            );
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
      }
    }

    // 8. Update last_run_at for all sources
    await db
      .from("circle_3_sources")
      .update({ last_run_at: new Date().toISOString() })
      .eq("active", true);

  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Finalise log
  if (logId) {
    await admin.from("import_logs").update({
      status: errors.length > 0 && totalImported === 0 ? "failed" : "completed",
      articles_fetched: totalFetched,
      articles_imported: totalImported,
      articles_skipped: totalSkipped,
      author_slots_imported: totalAuthorSlots,
      errors: errors.length > 0 ? errors : null,
      completed_at: new Date().toISOString(),
    }).eq("id", logId);

    try {
      const qc = await runArticleChecks(logId);
      if (!qc.passed) {
        console.warn(
          `[import-circle3] Article checks failed (${logId}): ` +
          qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
        );
      }
    } catch (qcErr) {
      console.warn(`[import-circle3] Article checks threw for ${logId}:`, qcErr);
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
