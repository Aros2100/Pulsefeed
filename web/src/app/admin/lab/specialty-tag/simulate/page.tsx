import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type SimulationDisagreement } from "./SimulatorClient";

interface Props {
  searchParams: Promise<{ run_id?: string }>;
}

type RawRun = {
  id: string;
  specialty: string;
  module: string;
  base_version: string;
  improved_prompt: string | null;
  fp_count: number | null;
  fn_count: number | null;
  created_at: string;
};

type RawDecision = {
  decision: string;
  ai_decision: string;
  ai_confidence: number | null;
  disagreement_reason: string | null;
  article_id: string | null;
  articles: { title: string; journal_title: string | null } | null;
};

export default async function SimulatePage({ searchParams }: Props) {
  const { run_id } = await searchParams;

  if (!run_id) redirect("/admin/lab/specialty-tag/optimize");

  const admin = createAdminClient();

  // Fetch the optimization run
  type RunResult = { data: RawRun | null; error: unknown };
  const { data: run } = await (
    admin
      .from("model_optimization_runs" as never)
      .select("id, specialty, module, base_version, improved_prompt, fp_count, fn_count, created_at")
      .eq("id", run_id)
      .single() as unknown as Promise<RunResult>
  );

  if (!run) redirect("/admin/lab/specialty-tag/optimize");

  // Fetch disagreements with article details (most recent first, deduplicated)
  const { data: rawDecisions } = await admin
    .from("lab_decisions")
    .select("decision, ai_decision, ai_confidence, disagreement_reason, article_id, articles(title, journal_title)")
    .eq("specialty", run.specialty)
    .eq("module", run.module)
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  const decisions = (rawDecisions ?? []) as RawDecision[];

  // Deduplicate by article_id, keep only disagreements, cap at 50
  const seenIds = new Set<string>();
  const disagreements: SimulationDisagreement[] = [];

  for (const d of decisions) {
    if (
      d.decision !== d.ai_decision &&
      d.article_id &&
      d.articles?.title &&
      !seenIds.has(d.article_id)
    ) {
      seenIds.add(d.article_id);
      disagreements.push({
        article_id:         d.article_id,
        title:              d.articles.title,
        journal_title:      d.articles.journal_title ?? null,
        human_decision:     d.decision,
        old_ai_decision:    d.ai_decision,
        old_ai_confidence:  d.ai_confidence ?? null,
        disagreement_reason: d.disagreement_reason ?? null,
      });
      if (disagreements.length >= 50) break;
    }
  }

  return (
    <SimulatorClient
      runId={run.id}
      specialty={run.specialty}
      module={run.module}
      baseVersion={run.base_version}
      initialPrompt={run.improved_prompt ?? ""}
      disagreements={disagreements}
    />
  );
}
