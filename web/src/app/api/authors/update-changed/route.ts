import { NextResponse, type NextRequest } from "next/server";
import { runAuthorUpdateBatch } from "@/lib/import/author-import/update-authors";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let dryRun = false;
  let limit = 100;
  let articleId: string | undefined;
  let triggeredBy: "manual" | "cron" = "manual";

  try {
    const body = await request.json();
    if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
    if (typeof body.limit === "number") limit = body.limit;
    if (typeof body.articleId === "string") articleId = body.articleId;
    if (body.triggeredBy === "cron") triggeredBy = "cron";
  } catch { /* body optional */ }

  try {
    const result = await runAuthorUpdateBatch({ dryRun, limit, articleId, triggeredBy });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[update-changed] batch failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
