import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPubMedIds, fetchArticleDetails } from "./importer";
import { runArticleChecks } from "@/lib/pubmed/quality-checks";
import { logArticleEvent } from "@/lib/article-events";
import { buildImportEventPayload } from "@/lib/article-events/import-payload";
import type { Json } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createAdminClient>;

const BATCH_SIZE = 20;
const RATE_LIMIT_MS = 110;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds a PubMed [AD] query from affiliation terms.
 * Single word (no spaces) → wildcard: neurosurg*[AD]
 * Multiple words → quoted phrase: "spine surgery"[AD]
 * Terms joined with OR.
 */
function buildAffiliationQuery(terms: string[]): string {
  return terms
    .map((t) => {
      const v = t.trim();
      return /\s/.test(v) ? `"${v}"[AD]` : `${v}*[AD]`;
    })
    .join(" OR ");
}

export interface Circle2ImportResult {
  logId: string | null;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Circle 2 import pipeline — affiliation-based only:
 *   1. Load active affiliation sources for the specialty
 *   2. Build combined OR query from all terms
 *   3. ESearch → PMIDs
 *   4. Deduplicate against existing articles (any circle)
 *   5. EFetch details
 *   6. Upsert with circle=2, verified=false
 *   7. Link authors
 *   8. Update last_run_at + finalise import_logs
 */
export async function runImportCircle2(
  specialty: string,
  existingLogId?: string,
  trigger: "cron" | "manual" = "cron"
): Promise<Circle2ImportResult> {
  const admin: AdminClient = createAdminClient();
  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let totalAuthorSlots = 0;

  // 1. Load active affiliation sources
  const { data: sources, error: sourcesErr } = await admin
    .from("circle_2_sources")
    .select("id, value, max_results")
    .eq("specialty", specialty)
    .eq("type", "affiliation")
    .eq("active", true);

  // Log-rækken oprettes normalt af kalderen (trigger-import-circle2/route.ts) inden
  // denne funktion kaldes — det sikrer at guarden mod concurrent imports virker.
  // Hvis ingen logId er givet (f.eks. ved direkte kald) oprettes den her som fallback.
  let logId = existingLogId ?? null;
  if (!logId) {
    const { data: filter } = await admin
      .from("pubmed_filters")
      .select("id")
      .eq("specialty", specialty)
      .eq("circle", 2)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    const { data: newLog } = await admin
      .from("import_logs")
      .insert({ filter_id: filter?.id ?? null, status: "running", trigger })
      .select("id")
      .single();
    logId = newLog?.id ?? null;
  }

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
      await admin
        .from("import_logs")
        .update({
          status: "failed",
          articles_imported: 0,
          articles_skipped: 0,
          errors: ["No active affiliation sources found"],
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return { logId, imported: 0, skipped: 0, errors: ["No active affiliation sources found"] };
  }

  try {
    // Track PMIDs seen across all source iterations to avoid double-importing
    const seenPmids = new Set<string>();

    // Pre-load existing pubmed_ids from DB once (used for cross-source dedup)
    // We'll refresh per-source to catch articles inserted in earlier iterations.

    // Global cap: all sources share the same max_results value (set identically via the UI)
    const maxTotalResults = sources[0].max_results ?? 100;

    // 2–7. Loop per source so each article gets its source_id populated
    for (const source of sources) {
      const query = buildAffiliationQuery([source.value]);
      const maxResults = source.max_results ?? 100;

      await sleep(RATE_LIMIT_MS);

      // 3. ESearch for this source
      const pmids = await fetchPubMedIds(query, maxResults);
      totalFetched += pmids.length;

      if (pmids.length === 0) continue;

      // 4. Deduplicate — against DB and already-seen PMIDs from earlier sources
      const unseenPmids = pmids.filter((id) => !seenPmids.has(id));
      if (unseenPmids.length === 0) {
        totalSkipped += pmids.length;
        continue;
      }

      const { data: existing } = await admin
        .from("articles")
        .select("pubmed_id")
        .in("pubmed_id", unseenPmids);
      const existingSet = new Set(existing?.map((r) => r.pubmed_id) ?? []);
      let newPmids = unseenPmids.filter((id) => !existingSet.has(id));
      totalSkipped += pmids.length - newPmids.length;

      // Apply global cap: never import more than maxTotalResults across all sources
      const remaining = maxTotalResults - totalImported;
      if (newPmids.length > remaining) {
        totalSkipped += newPmids.length - remaining;
        newPmids = newPmids.slice(0, remaining);
      }

      // Mark all as seen (including already-existing) so later sources skip them
      for (const id of unseenPmids) seenPmids.add(id);

      if (newPmids.length === 0) continue;

      // 5. EFetch
      const articles = await fetchArticleDetails(newPmids);

      // 6 + 7. Upsert + link authors
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
          specialty_tags:    [specialty],
          circle:            2,
          approval_method:   null,
          status:            "pending",
          source_id:         source.id,
        }));

        // ON CONFLICT (pubmed_id) DO NOTHING — never overwrite status/verified/specialty_tags
        const { data: upsertedRows, error: upsertErr } = await admin
          .from("articles")
          .upsert(batch, { onConflict: "pubmed_id", ignoreDuplicates: true })
          .select("id, pubmed_id");

        if (upsertErr) {
          errors.push(`Upsert batch error (source ${source.id}): ${upsertErr.message}`);
        } else {
          totalImported += (upsertedRows ?? []).length;
          totalAuthorSlots += batch.reduce((sum, a) => {
            const authors = (a.authors as unknown as unknown[]) ?? [];
            return sum + authors.length;
          }, 0);

          // Fire-and-forget — logArticleEvent catches its own errors
          void Promise.all(
            (upsertedRows ?? []).map((row) =>
              logArticleEvent(row.id, "imported", buildImportEventPayload({
                circle:          2,
                status:          "pending",
                approval_method: null,
                specialty_tags:  [specialty],
                pubmed_id:       row.pubmed_id,
                import_log_id:   logId,
                source_id:       source.id,
              }))
            )
          );

          if (upsertedRows && upsertedRows.length > 0) {
            const specialtyRows = upsertedRows.map((row) => ({
              article_id:      row.id,
              specialty:       specialty,
              specialty_match: null,
              source:          'c2_filter',
              scored_by:       null,
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

      // Update last_run_at for this source
      await admin
        .from("circle_2_sources")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", source.id);

      if (totalImported >= maxTotalResults) break;
    }

  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Finalise log
  if (logId) {
    const finalizePayload = {
      status: errors.length > 0 && totalImported === 0 ? "failed" : "completed",
      articles_fetched: totalFetched,
      articles_imported: totalImported,
      articles_skipped: totalSkipped,
      author_slots_imported: totalAuthorSlots,
      errors: errors.length > 0 ? errors : null,
      completed_at: new Date().toISOString(),
    };
    const { error: finalizeErr } = await admin
      .from("import_logs")
      .update(finalizePayload)
      .eq("id", logId);
    if (finalizeErr) {
      console.error(`[import-circle2] Failed to finalize log ${logId}:`, finalizeErr.message);
    }

    // Quality checks
    try {
      const qc = await runArticleChecks(logId);
      if (!qc.passed) {
        console.warn(
          `[import-circle2] Article checks failed for specialty "${specialty}" (${logId}): ` +
          `${qc.failedChecks}/${qc.totalChecks} checks failed — ` +
          qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
        );
      }
    } catch (qcErr) {
      console.warn(`[import-circle2] Article checks threw for ${logId}:`, qcErr);
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
