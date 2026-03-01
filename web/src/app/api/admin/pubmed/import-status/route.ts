import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing jobId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: log, error } = await admin
    .from("import_logs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !log) {
    return NextResponse.json(
      { ok: false, error: "Job not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, log });
}
