import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const specialty = request.nextUrl.searchParams.get("specialty");
  if (!specialty || !(SPECIALTY_SLUGS as readonly string[]).includes(specialty)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid specialty" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Only return articles that ARE scored but have NOT been validated via lab_decisions
  const { data: articles, error } = await admin.rpc(
    "get_scored_not_validated_articles",
    { p_specialty: specialty, p_limit: 100 },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: (articles ?? []) as unknown[] });
}
