import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data: articles, error } = await admin.rpc(
    "get_article_type_not_validated_articles",
    { p_limit: 30 },
  );

  if (error) {
    console.error("[article-type-articles] RPC error:", error);
    return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  }

  const list = (articles ?? []) as unknown[];
  console.log(`[article-type-articles] returned ${list.length} articles`);
  return NextResponse.json({ ok: true, articles: list });
}
