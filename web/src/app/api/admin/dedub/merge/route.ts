import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAuthorEvent } from "@/lib/author-events";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json() as {
    master_id?: string;
    slave_ids?: string[];
  };

  const { master_id, slave_ids } = body;

  if (!master_id || !slave_ids || slave_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "master_id og slave_ids er påkrævet" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin.rpc("merge_authors", {
    p_master_id: master_id,
    p_slave_ids: slave_ids,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Fire merged events — fire-and-forget
  void Promise.all([
    logAuthorEvent(master_id, "merged", {
      reason: "admin_merge",
      merged_into_id: master_id,
      merged_from_ids: slave_ids,
    }),
    ...slave_ids.map((slaveId) =>
      logAuthorEvent(slaveId, "merged", {
        reason: "admin_merge",
        merged_into_id: master_id,
        merged_from_id: slaveId,
      })
    ),
  ]);

  return NextResponse.json({ ok: true });
}
