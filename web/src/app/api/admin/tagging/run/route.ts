import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAutoTag } from "@/lib/tagging/auto-tagger";
import { SPECIALTIES } from "@/lib/auth/specialties";

async function runAllAutoTag() {
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);

  for (const specialty of activeSpecialties) {
    const result = await runAutoTag(specialty);
    console.log(
      `[tagging] auto-tag ${specialty}: tagged=${result.tagged}, skipped=${result.skipped}`
    );
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(() => runAllAutoTag());

  return NextResponse.json({ ok: true });
}
