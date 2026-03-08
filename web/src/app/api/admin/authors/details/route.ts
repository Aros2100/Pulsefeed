import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ ok: false, error: "ids parameter required" }, { status: 400 });
  }

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 20) {
    return NextResponse.json({ ok: false, error: "Provide 1-20 ids" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch authors
  const { data: authors, error: authErr } = await admin
    .from("authors")
    .select("id, display_name, affiliations, article_count, orcid")
    .in("id", ids);

  if (authErr) {
    return NextResponse.json({ ok: false, error: authErr.message }, { status: 500 });
  }

  // Fetch article links for these authors
  const { data: links, error: linkErr } = await admin
    .from("article_authors")
    .select("author_id, article_id")
    .in("author_id", ids);

  if (linkErr) {
    return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });
  }

  // Collect unique article IDs
  const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];

  // Fetch article details
  let articlesMap: Record<string, { id: string; title: string; journal_abbr: string | null; published_date: string | null }> = {};
  if (articleIds.length > 0) {
    const { data: articles } = await admin
      .from("articles")
      .select("id, title, journal_abbr, published_date")
      .in("id", articleIds);

    for (const a of articles ?? []) {
      articlesMap[a.id] = a;
    }
  }

  // Build author → articles mapping
  const authorArticlesMap: Record<string, typeof articlesMap[string][]> = {};
  for (const link of links ?? []) {
    if (!authorArticlesMap[link.author_id]) authorArticlesMap[link.author_id] = [];
    const article = articlesMap[link.article_id];
    if (article) authorArticlesMap[link.author_id].push(article);
  }

  // Sort each author's articles by published_date desc
  for (const list of Object.values(authorArticlesMap)) {
    list.sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? ""));
  }

  const result = (authors ?? []).map((a) => ({
    ...a,
    articles: authorArticlesMap[a.id] ?? [],
  }));

  return NextResponse.json({ ok: true, authors: result });
}
