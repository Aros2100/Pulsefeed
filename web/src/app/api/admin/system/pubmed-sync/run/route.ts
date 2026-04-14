import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runPubmedSync } from "@/lib/pubmed/sync-runner";

export async function POST(request: NextRequest) {
  // Accept enten admin-session eller CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  let mindate: string | undefined;
  let maxdate: string | undefined;
  let limit = 500;
  try {
    const body = (await request.json()) as { mindate?: string; maxdate?: string; limit?: number };
    mindate = body.mindate || undefined;
    maxdate = body.maxdate || undefined;
    if (body.limit && body.limit > 0) limit = body.limit;
  } catch {
    // body is optional
  }

  after(async () => {
    try {
      await runPubmedSync({ mindate, maxdate, esearchRetmax: limit });
    } catch (e) {
      console.error("[pubmed-sync/run] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
