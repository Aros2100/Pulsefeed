import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("import_logs")
    .select(`
      id,
      started_at,
      articles_imported,
      trigger,
      pubmed_filters(name, circle),
      author_linking_logs(articles_processed, authors_linked, status, new_authors, duplicates, rejected)
    `)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Filter = { name: string; circle: number | null } | null;
  type LinkingLog = { articles_processed: number; authors_linked: number; status: string; new_authors: number | null; duplicates: number | null; rejected: number | null };

  const ids = (data ?? []).map((il) => il.id);

  // Fetch unlinked author slots per import log in one RPC call
  const { data: slotsRows } = await admin.rpc(
    "unlinked_author_slots_for_import_logs" as never,
    { p_ids: ids } as never
  );
  type SlotsRow = { import_log_id: string; slots: number };
  const slotsByLogId = new Map<string, number>(
    ((slotsRows as unknown as SlotsRow[]) ?? []).map((r) => [r.import_log_id, Number(r.slots)])
  );

  const rows = (data ?? []).map((il) => {
    const filter = il.pubmed_filters as Filter;
    const linkingLogs = (il.author_linking_logs ?? []) as LinkingLog[];
    const linking = linkingLogs[0] ?? null;

    return {
      id: il.id,
      started_at: il.started_at,
      articles_imported: il.articles_imported,
      trigger: il.trigger,
      filter_name: filter?.name ?? null,
      circle: filter?.circle ?? null,
      authors_linked: linking?.authors_linked ?? null,
      linking_status: linking?.status ?? null,
      new_authors: linking?.new_authors ?? null,
      duplicates: linking?.duplicates ?? null,
      rejected: linking?.rejected ?? null,
      unlinked_author_slots: slotsByLogId.get(il.id) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, rows });
}
