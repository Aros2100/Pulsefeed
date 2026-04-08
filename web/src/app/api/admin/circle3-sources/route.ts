import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

type C3Source = {
  id: string;
  specialty: string;
  type: string;
  value: string;
  description: string | null;
  max_results: number | null;
  active: boolean;
  last_run_at: string | null;
};

const bulkSchema = z.object({
  terms:       z.array(z.string().min(1)).max(500),
  max_results: z.number().int().min(1).max(10000).optional(),
});

/** GET — hent alle C3-kilder */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: sources, error } = await db
    .from("circle_3_sources")
    .select("*")
    .order("created_at", { ascending: true }) as { data: C3Source[] | null; error: { message: string } | null };

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sources: sources ?? [] });
}

/** PUT — bulk-erstat alle affiliation-sources */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = bulkSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { terms, max_results } = result.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { error: deleteErr } = await db
    .from("circle_3_sources")
    .delete()
    .eq("type", "affiliation") as { error: { message: string } | null };

  if (deleteErr) return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });

  if (terms.length > 0) {
    const rows = terms.map((t) => ({
      specialty:   ACTIVE_SPECIALTY,
      type:        "affiliation",
      value:       t.trim(),
      active:      true,
      max_results: max_results ?? 500,
    }));
    const { error: insertErr } = await db
      .from("circle_3_sources")
      .insert(rows) as { error: { message: string } | null };
    if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
