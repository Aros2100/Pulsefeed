import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [logsResult, unlinkedResult, unlinkedSlotsResult, authorsResult, totalsResult] = await Promise.all([
    admin
      .from("author_linking_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
    admin.rpc("count_unlinked_articles"),
    admin.rpc("count_unlinked_author_slots"),
    admin.from("article_authors").select("id", { count: "exact", head: true }),
    admin
      .from("author_linking_logs")
      .select("new_authors, duplicates, rejected")
      .eq("status", "completed"),
  ]);

  const logs = logsResult.data ?? [];

  // Resolve import filter names for logs that have import_log_id
  const importLogIds = [
    ...new Set(
      logs
        .map((l) => (l as Record<string, unknown>).import_log_id as string | null)
        .filter(Boolean) as string[]
    ),
  ];

  let filterNameByImportLogId: Record<string, string> = {};
  if (importLogIds.length > 0) {
    const { data: importLogs } = await admin
      .from("import_logs")
      .select("id, pubmed_filters(name)")
      .in("id", importLogIds);

    for (const il of importLogs ?? []) {
      const filterName =
        (il.pubmed_filters as { name: string } | null)?.name ?? null;
      filterNameByImportLogId[il.id] = filterName ?? "—";
    }
  }

  const enrichedLogs = logs.map((l) => {
    const importLogId = (l as Record<string, unknown>).import_log_id as string | null;
    return {
      ...l,
      import_filter_name: importLogId ? (filterNameByImportLogId[importLogId] ?? "—") : null,
    };
  });

  const totals = totalsResult.data ?? [];
  const totalNew        = totals.reduce((s, r) => s + ((r as Record<string, number>).new_authors ?? 0), 0);
  const totalDuplicates = totals.reduce((s, r) => s + ((r as Record<string, number>).duplicates  ?? 0), 0);
  const totalRejected   = totals.reduce((s, r) => s + ((r as Record<string, number>).rejected    ?? 0), 0);

  return NextResponse.json({
    ok: true,
    latest: enrichedLogs[0] ?? null,
    logs: enrichedLogs,
    unlinkedCount: (unlinkedResult.data as number | null) ?? 0,
    unlinkedAuthorSlots: (unlinkedSlotsResult.data as number | null) ?? 0,
    totalAuthors: authorsResult.count ?? 0,
    totalNew,
    totalDuplicates,
    totalRejected,
  });
}
