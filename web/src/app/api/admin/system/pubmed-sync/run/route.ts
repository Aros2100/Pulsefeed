import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runPubmedSync } from "@/lib/pubmed/sync-runner";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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
      console.error("[pubmed-sync/run] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
