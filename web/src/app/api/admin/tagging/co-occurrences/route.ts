import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty") ?? "neurosurgery";
  const minCount = parseInt(searchParams.get("min_count") ?? "3", 10);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_mesh_co_occurrences" as never, {
    p_specialty: specialty,
    p_min_count: minCount,
  } as never);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
