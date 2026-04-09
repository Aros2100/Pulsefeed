import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAuthorUpdateBatch } from "@/lib/import/forfatter-import/update-authors";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let dryRun  = true;
  let limit   = 100;
  let articleId: string | undefined;

  try {
    const body = (await request.json()) as {
      dryRun?:    boolean;
      limit?:     number;
      articleId?: string;
    };
    if (typeof body.dryRun    === "boolean") dryRun    = body.dryRun;
    if (typeof body.limit     === "number")  limit     = body.limit;
    if (typeof body.articleId === "string")  articleId = body.articleId;
  } catch {
    // body er valgfri
  }

  try {
    const result = await runAuthorUpdateBatch({ dryRun, limit, articleId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[update-changed] batch fejlede:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
