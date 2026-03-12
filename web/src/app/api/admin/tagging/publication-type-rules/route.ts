import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [rulesRes, articleTypesRes, studyDesignsRes] = await Promise.all([
    admin
      .from("publication_type_rules" as never)
      .select("*" as never)
      .order("pubmed_type" as never),
    admin
      .from("article_type_categories" as never)
      .select("*" as never)
      .order("name" as never),
    admin
      .from("study_design_categories" as never)
      .select("*" as never)
      .order("name" as never),
  ]);

  if (rulesRes.error) {
    return NextResponse.json({ ok: false, error: rulesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rules: rulesRes.data,
    articleTypeCategories: articleTypesRes.data ?? [],
    studyDesignCategories: studyDesignsRes.data ?? [],
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    id: string;
    article_type: string | null;
    study_design: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("publication_type_rules" as never)
    .update({
      article_type: body.article_type ?? null,
      study_design: body.study_design ?? null,
    } as never)
    .eq("id" as never, body.id as never);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
