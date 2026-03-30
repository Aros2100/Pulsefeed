import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImpactFactorFetch } from "@/lib/import/fetch-impact-factors";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  void runImpactFactorFetch();

  return NextResponse.json({ ok: true });
}
