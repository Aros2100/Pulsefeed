import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPubMedIds, fetchArticleDetails } from "./importer";
import { runQualityChecks } from "@/lib/pubmed/quality-checks";
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

  if (sourcesErr) throw new Error(`Failed to fetch sources: ${sourcesErr.message}`);

  // Opret log-række hvis ingen eksisterende er givet
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
    // 2. Build combined query
    const terms = sources.map((s) => s.value);
    const query = buildAffiliationQuery(terms);
    const maxResults = Math.max(...sources.map((s) => s.max_results ?? 100));

    await sleep(RATE_LIMIT_MS);

    // 3. ESearch
    const pmids = await fetchPubMedIds(query, maxResults);
    totalFetched = pmids.length;

    if (pmids.length > 0) {
      // 4. Deduplicate
      const { data: existing } = await admin
        .from("articles")
        .select("pubmed_id")
        .in("pubmed_id", pmids);
      const existingSet = new Set(existing?.map((r) => r.pubmed_id) ?? []);
      const newPmids = pmids.filter((id) => !existingSet.has(id));
      totalSkipped = pmids.length - newPmids.length;

      if (newPmids.length > 0) {
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
            verified:          false,
            status:            "pending",
          }));

          const { data: upsertedRows, error: upsertErr } = await admin
            .from("articles")
            .upsert(batch, { onConflict: "pubmed_id" })
            .select("id, pubmed_id");

          if (upsertErr) {
            errors.push(`Upsert batch error: ${upsertErr.message}`);
          } else {
            totalImported += batch.length;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const authors = (a.authors as unknown as unknown[]) ?? [];
              return sum + authors.length;
            }, 0);
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
      }
    }

    // 8. Update last_run_at for all affiliation sources
    await admin
      .from("circle_2_sources")
      .update({ last_run_at: new Date().toISOString() })
      .eq("specialty", specialty)
      .eq("type", "affiliation");

  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Finalise log
  if (logId) {
    await admin
      .from("import_logs")
      .update({
        status: errors.length > 0 && totalImported === 0 ? "failed" : "completed",
        articles_fetched: totalFetched,
        articles_imported: totalImported,
        articles_skipped: totalSkipped,
        author_slots_imported: totalAuthorSlots,
        errors: errors.length > 0 ? errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);

    // Quality checks
    try {
      const qc = await runQualityChecks(logId);
      if (!qc.passed) {
        console.warn(
          `[import-circle2] Quality checks failed for specialty "${specialty}" (${logId}): ` +
          `${qc.failedChecks}/${qc.totalChecks} checks failed — ` +
          qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
        );
      }
    } catch (qcErr) {
      console.warn(`[import-circle2] Quality checks threw for ${logId}:`, qcErr);
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
