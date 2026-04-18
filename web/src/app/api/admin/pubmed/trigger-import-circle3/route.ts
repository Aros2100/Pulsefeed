import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImportCircle3 } from "@/specialties/neurosurgery/filter-c3";
import { runCitationFetch } from "@/lib/import/fetch-citations";
import { runPublicationTypeMapping } from "@/lib/tagging/publication-type-mapper";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Guard: tjek om der allerede kører en C3 import
  const { count } = await db
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .eq("circle", 3) as { count: number | null };

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "C3 import kører allerede — vent til den er færdig" },
      { status: 409 }
    );
  }

  // Opret import_log synkront — sikrer at guarden ser "running" med det samme
  const { data: newLog, error: logErr } = await db
    .from("import_logs")
    .insert({ filter_id: null, status: "running", trigger: "manual", circle: 3 })
    .select("id")
    .single() as { data: { id: string } | null; error: { message: string } | null };

  if (logErr || !newLog?.id) {
    return NextResponse.json(
      { ok: false, error: "Kunne ikke oprette import log" },
      { status: 500 }
    );
  }

  after(async () => {
    await runImportCircle3(newLog.id, "manual", 1);
  });

  after(async () => {
    await runCitationFetch(200);
  });

  after(() => {
  });

  return NextResponse.json({ ok: true });
}
