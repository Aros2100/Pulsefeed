import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ ok: true, terms: [] });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("search_mesh_terms", { p_query: q, p_limit: 20 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const terms = (data ?? []).map((r: { descriptor: string }) => r.descriptor);
  return NextResponse.json({ ok: true, terms });
}
