import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { finishScoringRun, failScoringRun } from "@/lib/scoring-runs";
import { ingestSpecialtyBatchResults } from "@/lib/scoring/batch/specialty-batch";
import { ingestSubspecialtyBatchResults } from "@/lib/scoring/batch/subspecialty-batch";
import { ingestArticleTypeBatchResults } from "@/lib/scoring/batch/article-type-batch";
import { ingestCondensationTextBatchResults } from "@/lib/scoring/batch/condensation-text-batch";
import { ingestCondensationSariBatchResults } from "@/lib/scoring/batch/condensation-sari-batch";
import { ingestArticleGeoClassABatchResults } from "@/lib/scoring/batch/article-geo-class-a-batch";
import { ingestArticleGeoClassBBatchResults } from "@/lib/scoring/batch/article-geo-class-b-batch";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Read row and verify preconditions
  const { data: row, error: fetchError } = await admin
    .from("scoring_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
  }

  if (row.status !== "ended") {
    return NextResponse.json(
      { ok: false, error: `Batch status is '${row.status}', must be 'ended' before ingesting` },
      { status: 400 }
    );
  }

  if (row.ingested_at !== null) {
    return NextResponse.json(
      { ok: false, error: "Batch has already been ingested" },
      { status: 400 }
    );
  }

  // Atomic lock: only proceed if status is still 'ended' and ingested_at is null
  const { data: locked, error: lockError } = await admin
    .from("scoring_batches")
    .update({ status: "ingesting" })
    .eq("id", id)
    .eq("status", "ended")
    .is("ingested_at", null)
    .select("id")
    .single();

  if (lockError || !locked) {
    return NextResponse.json(
      { ok: false, error: "Another ingest is in progress or batch is not in 'ended' state" },
      { status: 409 }
    );
  }

  let stats;
  try {
    if (row.module === "subspecialty") {
      const subStats = await ingestSubspecialtyBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.specialty,
        row.prompt_version
      );
      // Normalise to common shape for DB write below
      stats = { scored: subStats.scored, approved: undefined, rejected: undefined, failed: subStats.failed, failedIds: subStats.failedIds };
    } else if (row.module === "article_type_prod") {
      // Fetch typeCodeMap from DB using the stored specialty
      const { data: typeRows } = await admin
        .from("article_types")
        .select("code, name")
        .eq("specialty", row.specialty)
        .eq("active", true);
      const typeCodeMap = new Map<number, string>(
        ((typeRows ?? []) as { code: number; name: string }[]).map((r) => [r.code, r.name])
      );
      const atStats = await ingestArticleTypeBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.prompt_version,
        typeCodeMap
      );
      stats = { scored: atStats.scored, approved: undefined, rejected: undefined, failed: atStats.failed, failedIds: atStats.failedIds };
    } else if (row.module === "condensation_text") {
      const condStats = await ingestCondensationTextBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.specialty,
        row.prompt_version
      );
      stats = { scored: condStats.scored, approved: undefined, rejected: undefined, failed: condStats.failed, failedIds: condStats.failedIds };
    } else if (row.module === "condensation_sari") {
      const sariStats = await ingestCondensationSariBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.prompt_version
      );
      stats = { scored: sariStats.scored, approved: undefined, rejected: undefined, failed: sariStats.failed, failedIds: sariStats.failedIds };
    } else if (row.module === "article_geo_class_a") {
      const geoStats = await ingestArticleGeoClassABatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.prompt_version
      );
      stats = { scored: geoStats.scored, approved: undefined, rejected: undefined, failed: geoStats.failed, failedIds: geoStats.failedIds };
    } else if (row.module === "article_geo_class_b") {
      const geoBStats = await ingestArticleGeoClassBBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.prompt_version
      );
      stats = { scored: geoBStats.scored, approved: undefined, rejected: undefined, failed: geoBStats.failed, failedIds: geoBStats.failedIds };
    } else {
      stats = await ingestSpecialtyBatchResults(
        row.anthropic_batch_id,
        row.custom_id_map as Record<string, string>,
        row.specialty,
        row.prompt_version
      );
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[batch/ingest] ingest failed:", msg);

    await admin
      .from("scoring_batches")
      .update({ status: "failed", error: msg })
      .eq("id", id);

    if (row.scoring_run_id) {
      void failScoringRun(row.scoring_run_id, msg);
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  await admin
    .from("scoring_batches")
    .update({
      status:      "ingested",
      ingested_at: new Date().toISOString(),
      stats: {
        scored:     stats.scored,
        ...(stats.approved  !== undefined && { approved:  stats.approved }),
        ...(stats.rejected  !== undefined && { rejected:  stats.rejected }),
        failed:     stats.failed,
        failed_ids: stats.failedIds,
      },
    })
    .eq("id", id);

  if (row.scoring_run_id) {
    void finishScoringRun(row.scoring_run_id, stats.scored, stats.failed, row.article_count);
  }

  return NextResponse.json({ ok: true, stats });
}
