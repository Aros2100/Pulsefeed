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

  // Filter by circle column when provided (e.g. circle=3 for C3 imports)
  if (circle !== null && !isNaN(circle)) {
    logsQuery = logsQuery.eq("circle" as never, circle);
  } else if (specialty) {
    // Get filter IDs belonging to this specialty, then include logs that either
    // reference one of those filters OR have no specific filter (null = all filters run).
    const { data: filters } = await admin
      .from("pubmed_filters")
      .select("id")
      .eq("specialty", specialty);

    const filterIds = (filters ?? []).map((f) => f.id);

    logsQuery =
      filterIds.length > 0
        ? logsQuery.or(`filter_id.is.null,filter_id.in.(${filterIds.join(",")})`)
        : logsQuery.is("filter_id", null);
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
