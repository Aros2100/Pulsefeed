import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("article_specialties")
    .select("specialty")
    .order("specialty");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const specialties = [...new Set((data ?? []).map((r: { specialty: string }) => r.specialty))];
  return NextResponse.json({ ok: true, specialties });
}
