import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  // Count first so we can return the number of affected rows
  const { count } = await admin
    .from("authors")
    .select("id", { count: "exact", head: true })
    .not("ror_id", "is", null);

  const { error } = await admin
    .from("authors")
    .update({
      city:        null,
      state:       null,
      country:     null,
      region:      null,
      continent:   null,
      geo_source:  null,
      verified_by: null,
    })
    .not("ror_id", "is", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reset: count ?? 0 });
}
