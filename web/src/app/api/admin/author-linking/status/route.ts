import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [logsResult, unlinkedResult, unlinkedSlotsResult, authorsResult, totalsResult, rejectedAuthorsResult] = await Promise.all([
    admin
      .from("author_linking_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
    admin.rpc("count_unlinked_articles"),
    admin.rpc("count_unlinked_author_slots" as never),
    admin.from("authors").select("id", { count: "exact", head: true }),
    admin
      .from("author_linking_logs")
      .select("new_authors, duplicates, rejected, authors_processed")
      .in("status", ["completed", "running"]),
    admin
      .from("rejected_authors" as never)
      .select("id", { count: "exact", head: true }),
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

  const filterNameByImportLogId: Record<string, string> = {};
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
    const raw = l as Record<string, unknown>;
    const importLogId = raw.import_log_id as string | null;
    return {
      ...l,
      existing: (raw.duplicates as number) ?? 0,
      errors: (raw.rejected as number) ?? 0,
      authors_processed: (raw.authors_processed as number) ?? 0,
      import_filter_name: importLogId ? (filterNameByImportLogId[importLogId] ?? "—") : null,
    };
  });

  const totals = (totalsResult.data ?? []) as unknown as Record<string, number>[];
  const totalNew              = totals.reduce((s, r) => s + (r.new_authors       ?? 0), 0);
  const totalExisting         = totals.reduce((s, r) => s + (r.duplicates        ?? 0), 0);
  const totalErrors           = totals.reduce((s, r) => s + (r.rejected          ?? 0), 0);
  const totalAuthorsProcessed = totals.reduce((s, r) => s + (r.authors_processed ?? 0), 0);

  return NextResponse.json({
    ok: true,
    latest: enrichedLogs[0] ?? null,
    logs: enrichedLogs,
    unlinkedCount: (unlinkedResult.data as number | null) ?? 0,
    unlinkedAuthorSlots: (unlinkedSlotsResult.data as number | null) ?? 0,
    totalAuthors: authorsResult.count ?? 0,
    totalNew,
    totalExisting,
    totalErrors,
    totalAuthorsProcessed,
    rejectedAuthorsCount: rejectedAuthorsResult.count ?? 0,
  });
}
