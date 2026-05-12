import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";

const schema = z.object({
  pairId:      z.string().uuid(),
  winnerId:    z.string().uuid(),
  categoryIds: z.array(z.string().uuid()),
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

  // Verify pair belongs to the craft module and has already been decided
  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();
  if (!mod) return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });

  const { data: pair } = await admin
    .from("lab_value_pairs")
    .select("id, article_a_id, article_b_id, winner_id")
    .eq("id", pairId)
    .eq("module_id", mod.id)
    .maybeSingle();
  if (!pair) return NextResponse.json({ ok: false, error: "Pair not found" }, { status: 404 });

  type PairRow = { article_a_id: string; article_b_id: string; winner_id: string | null };
  const p = pair as PairRow;

  if (p.winner_id === null) {
    return NextResponse.json({ ok: false, error: "Pair has not been decided yet" }, { status: 409 });
  }
  if (winnerId !== p.article_a_id && winnerId !== p.article_b_id) {
    return NextResponse.json({ ok: false, error: "Winner must be one of the two articles in the pair" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Update winner
  const { error: pairErr } = await admin
    .from("lab_value_pairs")
    .update({ winner_id: winnerId, updated_at: now })
    .eq("id", pairId);
  if (pairErr) return NextResponse.json({ ok: false, error: pairErr.message }, { status: 500 });

  // Replace reason rows
  await admin.from("lab_value_pair_reasons").delete().eq("pair_id", pairId);
  if (categoryIds.length > 0) {
    const notesValue = notes && notes.trim().length > 0 ? notes.trim() : null;
    const reasonRows = categoryIds.map(catId => ({
      pair_id:     pairId,
      category_id: catId,
      notes:       notesValue,
    }));
    const { error: reasonErr } = await admin.from("lab_value_pair_reasons").insert(reasonRows);
    if (reasonErr) return NextResponse.json({ ok: false, error: reasonErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
