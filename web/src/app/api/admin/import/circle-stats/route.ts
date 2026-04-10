import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const circle = parseInt(searchParams.get("circle") ?? "0");
  if (![1, 2, 3, 4].includes(circle)) {
    return NextResponse.json({ ok: false, error: "Invalid circle (1-4)" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Count total articles in this circle
  const { count: totalCount } = await admin
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("circle", circle);
  const total = totalCount ?? 0;

  if (total === 0) {
    return NextResponse.json({ ok: true, total: 0, included: 0, pending: 0, excluded: 0 });
  }

  // Get all article IDs for this circle (needed to filter article_specialties by circle)
  const { data: circleArticleData } = await admin
    .from("articles")
    .select("id")
    .eq("circle", circle);
  const circleIds = (circleArticleData ?? []).map((r: { id: string }) => r.id);

  // Count articles with at least one specialty_match=true (included)
  const { data: includedData } = await admin
    .from("article_specialties")
    .select("article_id")
    .in("article_id", circleIds)
    .eq("specialty_match", true);
  const includedSet = new Set((includedData ?? []).map((r: { article_id: string }) => r.article_id));
  const included = includedSet.size;

  // Count articles with at least one specialty_match=false and no true (excluded)
  const { data: rejectedData } = await admin
    .from("article_specialties")
    .select("article_id")
    .in("article_id", circleIds)
    .eq("specialty_match", false);
  const rejectedSet = new Set((rejectedData ?? []).map((r: { article_id: string }) => r.article_id));
  for (const id of includedSet) rejectedSet.delete(id); // included overrides excluded
  const excluded = rejectedSet.size;

  const pending = total - included - excluded;

  return NextResponse.json({ ok: true, total, included, pending, excluded });
}
