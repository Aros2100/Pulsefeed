import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

async function runRecalculate() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);

  for (const specialty of activeSpecialties) {
    const { error } = await admin.rpc("recalculate_tagging_rule_combos", {
      p_specialty: specialty,
      p_include_c1: true,
    });
    if (error) {
      console.error(`[tagging] combo recalculate failed for ${specialty}:`, error.message);
    } else {
    }
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  void runRecalculate();

  return NextResponse.json({ ok: true });
}
