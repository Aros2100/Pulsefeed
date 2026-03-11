import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { runImportCircle2 } from "@/lib/pubmed/importer-circle2";
import { runCitationFetch } from "@/lib/pubmed/fetch-citations";
import { runLocationParsing } from "@/lib/geo/location-scorer";
import { createAdminClient } from "@/lib/supabase/admin";

// Allow up to 5 minutes — import kan tage tid ved mange PMIDs
export const maxDuration = 300;

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

  const admin = createAdminClient();

  // Slår C2-filter op for at få filter_id til import_log (samme logik som importer-circle2)
  const { data: filter } = await admin
    .from("pubmed_filters")
    .select("id")
    .eq("specialty", specialty)
    .eq("circle", 2)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const filterId = filter?.id ?? null;

  // Guard: tjek om der allerede kører en import med samme filter_id.
  // Virker også når filterId er null (IS NULL check i stedet for =).
  const baseQuery = admin
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const { count } = await (filterId !== null
    ? baseQuery.eq("filter_id", filterId)
    : baseQuery.is("filter_id", null));

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: `C2 import kører allerede for ${specialty} — vent til den er færdig` },
      { status: 409 }
    );
  }

  // Opret import_log synkront her — INDEN response sendes.
  // Det sikrer at næste request ser "running" med det samme (eliminerer race condition).
  const { data: newLog, error: logErr } = await admin
    .from("import_logs")
    .insert({ filter_id: filterId, status: "running", trigger: "manual" })
    .select("id")
    .single();

  if (logErr || !newLog?.id) {
    return NextResponse.json(
      { ok: false, error: "Kunne ikke oprette import log" },
      { status: 500 }
    );
  }

  // after() holder Vercel-funktionen i live efter response — erstatter void (fire-and-forget)
  // som fejlagtigt blev dræbt af Vercel inden importen nåede at færdiggøre.
  after(async () => {
    await runImportCircle2(specialty, newLog.id, "manual");
  });

  after(async () => {
    await runCitationFetch(200);
  });

  after(() => {
    runLocationParsing(200).then(r => console.log("[geo/auto-parse]", r)).catch(e => console.error("[geo/auto-parse] error:", e));
  });

  return NextResponse.json({ ok: true });
}
