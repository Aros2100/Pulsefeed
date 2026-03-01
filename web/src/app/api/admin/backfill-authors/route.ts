import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { linkAuthorsToArticle } from "@/lib/pubmed/importer";
import type { Author } from "@/lib/pubmed/importer";

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const admin = createAdminClient();

  // Fetch articles that have authors in JSONB but no rows in article_authors yet.
  // We use a LEFT JOIN via subquery: articles whose id is not in article_authors.
  const { data: articles, error, count } = await admin
    .from("articles")
    .select("id, pubmed_id, authors", { count: "exact" })
    .not("id", "in", `(SELECT DISTINCT article_id FROM article_authors)`)
    .range(offset, offset + BATCH_SIZE - 1)
    .order("imported_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const batch = articles ?? [];
  const errors: string[] = [];
  let linked = 0;
  let skipped = 0;

  console.log(`[backfill-authors] offset=${offset} batch=${batch.length} remaining≈${(count ?? 0) - offset}`);

  for (const article of batch) {
    const rawAuthors = article.authors as unknown as Author[] | null;
    if (!rawAuthors?.length) {
      skipped++;
      continue;
    }

    await linkAuthorsToArticle(admin, article.id, rawAuthors).then(() => {
      linked++;
      console.log(`[backfill-authors] linked ${rawAuthors.length} authors for PMID ${article.pubmed_id}`);
    }).catch((e) => {
      const msg = `PMID ${article.pubmed_id}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      console.error(`[backfill-authors] error — ${msg}`);
    });
  }

  const nextOffset = offset + batch.length;
  const done = batch.length < BATCH_SIZE;

  console.log(`[backfill-authors] batch done — linked=${linked} skipped=${skipped} errors=${errors.length} done=${done}`);

  return NextResponse.json({
    ok: true,
    linked,
    skipped,
    errors,
    nextOffset: done ? null : nextOffset,
    done,
    totalRemaining: count ?? null,
  });
}
