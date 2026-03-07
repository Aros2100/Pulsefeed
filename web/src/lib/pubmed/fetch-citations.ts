import { createAdminClient } from "@/lib/supabase/admin";

const DELAY_MS = 200; // 5 req/s — safely under Europe PMC limits

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Europe PMC response shape ──────────────────────────────────────────────

interface EuropePmcCitationResponse {
  hitCount?: number;
}

/**
 * Fetch the citation count for a single PubMed article via Europe PMC.
 * Returns null when the article is not found or the request fails.
 */
export async function fetchCitationCount(pmid: string): Promise<number | null> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/MED/${pmid}/citations?format=json&page=1&pageSize=1`;
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      // 10-second timeout via AbortSignal
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[fetch-citations] HTTP ${res.status} for PMID ${pmid}`);
      return null;
    }
    const data = (await res.json()) as EuropePmcCitationResponse;
    return data.hitCount ?? null;
  } catch (err) {
    console.warn(`[fetch-citations] Failed for PMID ${pmid}:`, err);
    return null;
  }
}

/**
 * Batch-fetch citation counts for articles that have never been fetched
 * or were last fetched more than 7 days ago.
 */
export async function runCitationFetch(limit = 500): Promise<{ updated: number; failed: number }> {
  const admin = createAdminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: articles, error } = await admin
    .from("articles")
    .select("id, pubmed_id")
    .not("pubmed_id", "is", null)
    .or(`citations_fetched_at.is.null,citations_fetched_at.lt.${sevenDaysAgo}`)
    .limit(limit);

  if (error) {
    console.error("[fetch-citations] Failed to fetch articles:", error.message);
    return { updated: 0, failed: 0 };
  }

  const rows = (articles ?? []) as Array<{ id: string; pubmed_id: string }>;
  let updated = 0;
  let failed  = 0;

  for (const row of rows) {
    await sleep(DELAY_MS);

    const count = await fetchCitationCount(row.pubmed_id);

    const { error: updateError } = await admin
      .from("articles")
      .update({
        citation_count:       count,
        citations_fetched_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) {
      console.error(`[fetch-citations] Update failed for article ${row.id}:`, updateError.message);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`[fetch-citations] done — updated: ${updated}, failed: ${failed}, total: ${rows.length}`);
  return { updated, failed };
}
