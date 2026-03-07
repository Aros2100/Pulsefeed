import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runCitationFetch } from "@/lib/pubmed/fetch-citations";

export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    await runCitationFetch();
  });

  return NextResponse.json({ ok: true });
}
