import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { runImportCircle2 } from "@/lib/pubmed/importer-circle2";

export async function POST(request: NextRequest) {
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

  const { data: log, error } = await admin
    .from("import_logs")
    .insert({ filter_id: null, status: "running" })
    .select("id")
    .single();

  if (error || !log?.id) {
    return NextResponse.json(
      { ok: false, error: "Failed to create import job" },
      { status: 500 }
    );
  }

  // Fire-and-forget
  void runImportCircle2(specialty, log.id);

  return NextResponse.json({ ok: true, jobId: log.id });
}
