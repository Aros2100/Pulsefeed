import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImpactFactorFetch } from "@/lib/pubmed/fetch-impact-factors";

export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    await runImpactFactorFetch();
  });

  return NextResponse.json({ ok: true });
}
