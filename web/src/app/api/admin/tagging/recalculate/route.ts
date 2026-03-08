import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

async function runRecalculate() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);

  for (const specialty of activeSpecialties) {
    const { error } = await admin.rpc("recalculate_tagging_rules" as never, {
      p_specialty: specialty,
    } as never);
    if (error) {
      console.error(`[tagging] recalculate failed for ${specialty}:`, error.message);
    } else {
      console.log(`[tagging] recalculated rules for ${specialty}`);
    }
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(() => runRecalculate());

  return NextResponse.json({ ok: true });
}
