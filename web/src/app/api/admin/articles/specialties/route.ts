import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_distinct_specialties");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const specialties = (data ?? []).map((r: { specialty: string }) => r.specialty);
  return NextResponse.json({ ok: true, specialties });
}
