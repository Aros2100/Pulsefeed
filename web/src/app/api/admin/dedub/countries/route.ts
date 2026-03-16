import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authors")
    .select("country")
    .not("country", "is", null);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const all = [
    ...new Set((data ?? []).map((r: { country: string }) => r.country)),
  ].sort() as string[];

  const PRIORITY = ["Denmark"];
  const priority = PRIORITY.filter((c) => all.includes(c));
  const rest = all.filter((c) => !PRIORITY.includes(c));

  return NextResponse.json({ ok: true, countries: [...priority, ...rest] });
}
