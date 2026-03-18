import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_distinct_specialty_tags") as {
    data: { tag: string }[] | null;
    error: unknown;
  };

  if (error) {
    console.error("[subspecialty-tags]", error);
    return NextResponse.json({ ok: false, tags: [] });
  }

  const tags = (data ?? []).map((r) => r.tag).filter(Boolean);
  return NextResponse.json({ ok: true, tags });
}
