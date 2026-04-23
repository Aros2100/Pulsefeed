import { createAdminClient } from "@/lib/supabase/admin";

export async function startScoringRun(
  module: string,
  specialty: string,
  version: string,
  triggeredBy = "admin"
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("scoring_runs")
      .insert({ module, specialty, version, triggered_by: triggeredBy, status: "running" })
      .select("id")
      .single();
    if (error) { console.error("[scoring-runs] startScoringRun failed:", error.message); return null; }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[scoring-runs] startScoringRun threw:", e);
    return null;
  }
}

export async function finishScoringRun(
  runId: string | null,
  scored: number,
  failed: number,
  total: number
): Promise<void> {
  if (!runId) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("scoring_runs")
      .update({ status: "done", finished_at: new Date().toISOString(), scored, failed, total })
      .eq("id", runId);
    if (error) console.error("[scoring-runs] finishScoringRun failed:", error.message);
  } catch (e) {
    console.error("[scoring-runs] finishScoringRun threw:", e);
  }
}

export async function failScoringRun(
  runId: string | null,
  errorMessage: string
): Promise<void> {
  if (!runId) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("scoring_runs")
      .update({ status: "error", finished_at: new Date().toISOString(), error: errorMessage })
      .eq("id", runId);
    if (error) console.error("[scoring-runs] failScoringRun failed:", error.message);
  } catch (e) {
    console.error("[scoring-runs] failScoringRun threw:", e);
  }
}
