import { NextResponse, type NextRequest } from "next/server";
import { runImport } from "@/lib/pubmed/importer";

// Allow up to 5 minutes for the import to complete
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await runImport();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/run-import]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
