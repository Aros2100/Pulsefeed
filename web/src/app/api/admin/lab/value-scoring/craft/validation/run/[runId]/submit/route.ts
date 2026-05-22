import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeOutcome, computeOutcomeSingleAnchor } from "@/lib/lab/value-scoring/validation";

const schema = z.object({
  itemId:         z.string().uuid(),
  // Single-anchor fields
  choice:         z.enum(['new', 'anchor']).optional(),
  // Legacy 2-anchor fields
  choiceLow:      z.enum(['new', 'anchor']).optional(),
  choiceHigh:     z.enum(['new', 'anchor']).optional(),
  validatorNotes: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const { itemId, choice, choiceLow, choiceHigh, validatorNotes } = parsed.data;

  try {
    const now = new Date().toISOString();

    let outcome: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updatePayload: Record<string, any>;

    if (choice !== undefined) {
      // Single-anchor flow: fetch item to get anchor_side
      const { data: itemRow } = await admin
        .from('lab_value_validation_items')
        .select('anchor_side')
        .eq('id', itemId)
        .eq('run_id', runId)
        .maybeSingle();
      if (!itemRow) {
        return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
      }
      type ItemRow = { anchor_side: string | null };
      const it = itemRow as ItemRow;
      if (!it.anchor_side) {
        return NextResponse.json({ ok: false, error: 'Item has no anchor_side — cannot compute outcome' }, { status: 400 });
      }
      const side = it.anchor_side as 'lower' | 'upper';
      outcome = computeOutcomeSingleAnchor(side, choice);
      updatePayload = {
        choice,
        outcome,
        validator_notes: validatorNotes ?? null,
        validated_at:    now,
      };
    } else {
      // Legacy 2-anchor flow
      outcome = computeOutcome(choiceLow ?? null, choiceHigh ?? null);
      updatePayload = {
        ...(choiceLow  !== undefined ? { choice_low:  choiceLow  } : {}),
        ...(choiceHigh !== undefined ? { choice_high: choiceHigh } : {}),
        outcome,
        validator_notes: validatorNotes ?? null,
        validated_at:    now,
      };
    }

    // Update the item
    const { error: itemErr } = await admin
      .from('lab_value_validation_items')
      .update(updatePayload)
      .eq('id', itemId)
      .eq('run_id', runId);
    if (itemErr) throw new Error(`Failed to update item: ${itemErr.message}`);

    // Check if all items in this run are now validated
    const { count: pendingCount } = await admin
      .from('lab_value_validation_items')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .is('validated_at', null);

    if (pendingCount === 0) {
      await admin
        .from('lab_value_validation_runs')
        .update({ status: 'complete', completed_at: now })
        .eq('id', runId);
    }

    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
