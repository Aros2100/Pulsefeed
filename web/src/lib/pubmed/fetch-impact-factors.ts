import { createAdminClient } from "@/lib/supabase/admin";

const DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface OpenAlexSummaryStats {
  "2yr_mean_citedness"?: number | null;
  h_index?:              number | null;
}

interface OpenAlexSource {
  summary_stats?: OpenAlexSummaryStats;
}

interface OpenAlexResponse {
  results?: OpenAlexSource[];
}

interface JournalStats {
  factor: number | null;
  hIndex: number | null;
}

/**
 * Fetch journal stats for a given ISSN via OpenAlex.
 * Uses summary_stats.2yr_mean_citedness (JIF proxy) and summary_stats.h_index — both free.
 * Returns nulls when the journal is not found or the request fails.
 */
export async function fetchJournalStats(issn: string): Promise<JournalStats> {
  const url = `https://api.openalex.org/sources?filter=issn:${issn}`;
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[fetch-if] HTTP ${res.status} for ISSN ${issn}`);
      return { factor: null, hIndex: null };
    }
    const data   = (await res.json()) as OpenAlexResponse;
    const stats  = data.results?.[0]?.summary_stats;
    return {
      factor: stats?.["2yr_mean_citedness"] ?? null,
      hIndex: stats?.h_index ?? null,
    };
  } catch (err) {
    console.warn(`[fetch-if] Failed for ISSN ${issn}:`, err);
    return { factor: null, hIndex: null };
  }
}

/**
 * Batch-fetch impact factors for articles that have an ISSN and have never
 * been fetched or were last fetched more than 30 days ago.
 * Deduplicates by ISSN — one API call per unique ISSN, then batch-updates
 * all articles sharing that ISSN.
 */
export async function runImpactFactorFetch(limit = 500): Promise<{ updated: number; failed: number }> {
  const admin = createAdminClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("articles")
    .select("id, issn_electronic, issn_print")
    .or(`impact_factor_fetched_at.is.null,impact_factor_fetched_at.lt.${thirtyDaysAgo}`)
    .limit(limit);

  if (error) {
    console.error("[fetch-if] Failed to fetch articles:", error.message);
    return { updated: 0, failed: 0 };
  }

  // Group article IDs by ISSN — deduplicate API calls
  const issnMap = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ id: string; issn_electronic: string | null; issn_print: string | null }>) {
    const issn = row.issn_electronic ?? row.issn_print;
    if (!issn) continue;
    if (!issnMap.has(issn)) issnMap.set(issn, []);
    issnMap.get(issn)!.push(row.id);
  }

  let updated = 0;
  let failed  = 0;

  for (const [issn, articleIds] of issnMap) {
    await sleep(DELAY_MS);

    const { factor, hIndex } = await fetchJournalStats(issn);

    const { error: updateError } = await admin
      .from("articles")
      .update({
        impact_factor:            factor,
        journal_h_index:          hIndex,
        impact_factor_fetched_at: new Date().toISOString(),
      } as never)
      .in("id", articleIds);

    if (updateError) {
      console.error(`[fetch-if] Batch update failed for ISSN ${issn}:`, updateError.message);
      failed += articleIds.length;
    } else {
      updated += articleIds.length;
      const { error: evErr } = await admin
        .from("article_events" as never)
        .insert(articleIds.map((articleId) => ({
          article_id: articleId,
          event_type: "impact_factor_updated",
          payload:    { impact_factor: factor, journal_h_index: hIndex },
        })) as never);
      if (evErr) console.warn(`[fetch-if] Event insert failed for ISSN ${issn}:`, evErr.message);
    }
  }

  console.log(`[fetch-if] done — updated: ${updated}, failed: ${failed}, unique ISSNs: ${issnMap.size}`);
  return { updated, failed };
}
