/**
 * Post-parser state enrichment for article_geo_addresses.
 *
 * For each row where state IS NULL and city IS NOT NULL, looks up the state
 * via geo_cities (through lookupStateByCity) and writes it back with
 * state_source = 'enrichment'.
 *
 * Called from the author-linker after Klasse B rows are written (step 4 of 8),
 * and later from AI batch ingest (step 5 of 8).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupStateByCity } from "./city-cache";

export interface EnrichmentResult {
  total_rows: number;
  enriched:   number;
  unchanged:  number;
  errors:     number;
}

export async function enrichArticleAddresses(
  articleId: string
): Promise<EnrichmentResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("article_geo_addresses")
    .select("id, city, country")
    .eq("article_id", articleId)
    .is("state", null)
    .not("city", "is", null);

  if (error) throw new Error(`enrichArticleAddresses fetch failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; city: string; country: string | null }>;

  const result: EnrichmentResult = {
    total_rows: rows.length,
    enriched:   0,
    unchanged:  0,
    errors:     0,
  };

  for (const row of rows) {
    try {
      const state = await lookupStateByCity(row.city, row.country ?? undefined);
      if (state) {
        const { error: upErr } = await admin
          .from("article_geo_addresses")
          .update({ state, state_source: "enrichment", updated_at: new Date().toISOString() })
          .eq("id", row.id);

        if (upErr) { result.errors++; continue; }
        result.enriched++;
      } else {
        result.unchanged++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
