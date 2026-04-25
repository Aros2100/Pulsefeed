/**
 * raw-writer.ts
 *
 * Helper for writing raw PubMed XML to article_pubmed_raw and updating
 * pubmed_raw_latest_at on articles. Used by import pipeline and backfill job.
 */

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminDb = ReturnType<typeof createAdminClient>;

export function hashXml(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex");
}

export interface RawXmlRow {
  articleId: string;
  pubmedId: string;
  rawXml: string;
}

export async function saveRawXml(
  admin: AdminDb,
  rows: RawXmlRow[],
  fetchSource: "import" | "pubmed_sync" | "backfill" | "manual"
): Promise<void> {
  if (rows.length === 0) return;

  const now = new Date().toISOString();

  const inserts = rows.map((r) => ({
    article_id:   r.articleId,
    pubmed_id:    r.pubmedId,
    raw_xml:      r.rawXml,
    raw_xml_hash: hashXml(r.rawXml),
    fetched_at:   now,
    fetch_source: fetchSource,
  }));

  // Insert with ON CONFLICT DO NOTHING (same article + same XML hash = skip)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("article_pubmed_raw")
    .upsert(inserts, { onConflict: "article_id,raw_xml_hash", ignoreDuplicates: true });

  // Always update pubmed_raw_latest_at regardless of whether insert was a dup
  const articleIds = rows.map((r) => r.articleId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("articles")
    .update({ pubmed_raw_latest_at: now })
    .in("id", articleIds);
}
