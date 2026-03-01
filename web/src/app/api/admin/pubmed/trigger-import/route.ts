import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const admin = createAdminClient();

  const { data: log, error } = await admin
    .from("import_logs")
    .insert({ filter_id: filterId ?? null, status: "running" })
    .select("id")
    .single();

  if (error || !log?.id) {
    return NextResponse.json(
      { ok: false, error: "Failed to create import job" },
      { status: 500 }
    );
  }

  // Fire-and-forget — works in Node.js dev server.
  // In Vercel production, replace with a proper queue (e.g. Vercel Queues).
  void runImport(filterId, false, log.id);

  return NextResponse.json({ ok: true, jobId: log.id });
}
