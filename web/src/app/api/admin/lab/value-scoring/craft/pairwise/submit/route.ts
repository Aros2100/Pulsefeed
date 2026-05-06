import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModule } from "@/lib/lab/value-scoring/session";

const schema = z.object({
  pairId:      z.string().uuid(),
  winnerId:    z.string().uuid(),
  categoryIds: z.array(z.string().uuid()).min(1, "At least one reason category required"),
  notes:       z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { pairId, winnerId, categoryIds, notes } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const mod = await resolveModule(admin);
  if (!mod.ok) return NextResponse.json({ ok: false, error: mod.error }, { status: mod.status });

  // Validate the pair belongs to the module and the winner matches one side
  const { data: pair } = await admin
    .from("lab_value_pairs")
    .select("id, article_a_id, article_b_id, session_id, winner_id")
    .eq("id", pairId)
    .eq("module_id", mod.moduleId)
    .maybeSingle();

  if (!pair) return NextResponse.json({ ok: false, error: "Pair not found" }, { status: 404 });
  if (winnerId !== pair.article_a_id && winnerId !== pair.article_b_id) {
    return NextResponse.json({ ok: false, error: "Winner must be one of the two articles in the pair" }, { status: 400 });
  }
  if (pair.winner_id !== null) {
    return NextResponse.json({ ok: false, error: "Pair already has a winner — use /edit" }, { status: 409 });
  }

  // Update pair
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("lab_value_pairs")
    .update({ winner_id: winnerId, updated_at: now })
    .eq("id", pairId);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  // Insert reason rows (notes attached to all rows for this submit)
  const reasonRows = categoryIds.map(catId => ({
    pair_id:     pairId,
    category_id: catId,
    notes:       notes && notes.trim().length > 0 ? notes.trim() : null,
  }));
  const { error: reasonErr } = await admin.from("lab_value_pair_reasons").insert(reasonRows);
  if (reasonErr) return NextResponse.json({ ok: false, error: reasonErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
