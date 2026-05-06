import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { startScoringRun } from "@/lib/scoring-runs";
import { prepareSubspecialtyBatch } from "@/lib/scoring/batch/subspecialty-batch";
import { submitBatch } from "@/lib/scoring/batch/client";

const schema = z.object({
  specialty: z.string().refine((v) => v === ACTIVE_SPECIALTY, "Invalid specialty"),
  limit:     z.number().int().positive().max(10000).optional(),
  edat_from: z.string().optional(),
  edat_to:   z.string().optional(),
  mode:      z.enum(["new", "rescore"]).optional(),
  since:     z.string().datetime().optional(),
}).refine(
  (data) => !(data.mode && !data.since) && !(!data.mode && data.since),
  { message: "mode and since must be provided together" }
).refine(
  (data) => !(data.mode && data.limit && data.limit > 500),
  { message: "limit must be <= 500 when mode is set" }
);

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[batch/subspecialty/submit] CRON_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const isCronCall = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let userId: string | undefined;
  if (!isCronCall) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    userId = auth.userId;
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, limit, edat_from, edat_to, mode, since } = result.data;
  const triggeredBy = isCronCall ? "cron" : (userId ?? "manual");

  let prepared;
  try {
    prepared = await prepareSubspecialtyBatch(specialty, { limit, edat_from, edat_to, mode, since });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { activePrompt, articles, requests, customIdMap } = prepared;

  if (articles.length === 0) {
    return NextResponse.json({ ok: true, batchId: null, message: "No articles to score", articleCount: 0 });
  }

  let anthropicBatch;
  try {
    anthropicBatch = await submitBatch(requests);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Batch submission failed: ${(e as Error).message}` }, { status: 502 });
  }

  const runId = await startScoringRun("subspecialty", specialty, activePrompt.version, `batch:${triggeredBy}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: batchRow, error: insertError } = await admin
    .from("scoring_batches")
    .insert({
      anthropic_batch_id: anthropicBatch.id,
      module:             "subspecialty",
      specialty,
      prompt_version:     activePrompt.version,
      status:             anthropicBatch.processing_status === "in_progress" ? "in_progress" : "submitted",
      article_count:      articles.length,
      custom_id_map:      customIdMap,
      triggered_by:       triggeredBy,
      scoring_run_id:     runId,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[batch/subspecialty/submit] scoring_batches insert failed:", insertError.message);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:               true,
    batchId:          (batchRow as { id: string }).id,
    anthropicBatchId: anthropicBatch.id,
    articleCount:     articles.length,
    promptVersion:    activePrompt.version,
  });
}
