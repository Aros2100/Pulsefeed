import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeOutcome } from "@/lib/lab/value-scoring/validation";

const schema = z.object({
  itemId:         z.string().uuid(),
  choiceLow:      z.enum(['new', 'anchor']),
  choiceHigh:     z.enum(['new', 'anchor']),
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
  const { itemId, choiceLow, choiceHigh, validatorNotes } = parsed.data;

  try {
    const outcome = computeOutcome(choiceLow, choiceHigh);
    const now = new Date().toISOString();

    // Update the item
    const { error: itemErr } = await admin
      .from('lab_value_validation_items')
      .update({
        choice_low:      choiceLow,
        choice_high:     choiceHigh,
        outcome,
        validator_notes: validatorNotes ?? null,
        validated_at:    now,
      })
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
