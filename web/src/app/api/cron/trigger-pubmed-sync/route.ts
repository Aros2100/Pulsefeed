import { NextResponse, type NextRequest, after } from "next/server";
import { runPubmedSync } from "@/lib/pubmed/sync-runner";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let daysBack = 7;
  let limit = 500;
  try {
    const body = (await request.json()) as { daysBack?: number; limit?: number };
    if (body.daysBack && body.daysBack > 0) daysBack = body.daysBack;
    if (body.limit   && body.limit > 0)    limit    = body.limit;
  } catch {
    // body is optional
  }

  after(async () => {
    try {
      await runPubmedSync({ daysBack, esearchRetmax: limit });
    } catch (e) {
      console.error("[trigger-pubmed-sync] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
