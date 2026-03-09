import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("author_linking_logs")
    .update({ status: "failed", completed_at: new Date().toISOString(), errors: ["Manual reset by admin"] })
    .eq("status", "running")
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const resetCount = data?.length ?? 0;
  return NextResponse.json({ ok: true, resetCount });
}
