import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runCitationFetch } from "@/lib/pubmed/fetch-citations";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  void runCitationFetch();

  return NextResponse.json({ ok: true });
}
