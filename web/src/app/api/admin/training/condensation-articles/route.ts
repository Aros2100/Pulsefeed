import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const specialty = request.nextUrl.searchParams.get("specialty");
  if (!specialty || specialty !== ACTIVE_SPECIALTY) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid specialty" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: articles, error } = await admin.rpc(
    "get_condensation_not_validated_articles",
    { p_specialty: specialty, p_limit: 100 },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: (articles ?? []) as unknown[] });
}
