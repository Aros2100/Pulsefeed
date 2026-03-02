import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { runImportCircle2 } from "@/lib/pubmed/importer-circle2";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const specialty = request.nextUrl.searchParams.get("specialty");
  if (!specialty || !(SPECIALTY_SLUGS as readonly string[]).includes(specialty)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid specialty" },
      { status: 400 }
    );
  }

  // Fire-and-forget — runImportCircle2 opretter selv import_logs rækken
  void runImportCircle2(specialty, undefined, "manual");

  return NextResponse.json({ ok: true });
}
