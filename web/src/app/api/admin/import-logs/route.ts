import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const specialty  = searchParams.get("specialty");
  const circleStr  = searchParams.get("circle");
  const circle     = circleStr ? parseInt(circleStr) : null;
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "10")), 100);

  const admin = createAdminClient();

  let logsQuery = admin
    .from("import_logs")
    .select("*, pubmed_filters(name, specialty)")
    .order("started_at", { ascending: false })
    .limit(limit);

  // Filter by circle column for C3 (which sets import_logs.circle = 3).
  // C1/C2 logs don't have circle set — filter by specialty + pubmed_filters instead.
  if (circle === 3) {
    logsQuery = logsQuery.eq("circle", 3);
  } else if (specialty) {
    const { data: filters } = await admin
      .from("pubmed_filters")
      .select("id")
      .eq("specialty", specialty);

    let filterIds = (filters ?? []).map((f) => f.id);

    // If circle param is provided (1, 2, or 4), narrow to filters of that circle
    if (circle === 1 || circle === 2 || circle === 4) {
      const circleFilterIds = new Set(
        ((await admin.from("pubmed_filters").select("id").eq("specialty", specialty).eq("circle", circle)).data ?? []).map((f) => f.id)
      );
      filterIds = filterIds.filter((id) => circleFilterIds.has(id));
    }

    if (filterIds.length === 0) {
      return NextResponse.json({ ok: true, logs: [] });
    }
    logsQuery = logsQuery.or(`filter_id.in.(${filterIds.join(",")})`);
  }

  const { data: logs, error } = await logsQuery;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, logs: logs ?? [] });
}
