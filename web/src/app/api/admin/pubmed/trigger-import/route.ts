import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImport } from "@/lib/pubmed/importer";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let filterId: string | undefined;
  try {
    const body = (await request.json()) as { filterId?: string };
    filterId = body.filterId || undefined;
  } catch {
    // Body is optional
  }

  // Fire-and-forget — runImport opretter selv import_logs rækker pr. filter
  void runImport(filterId, false, undefined, "manual");

  return NextResponse.json({ ok: true });
}
