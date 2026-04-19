import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type SimulationDisagreement, type SimulationAgreement, type SimulatorConfig } from "@/components/lab/SimulatorClient";

const CONFIG: SimulatorConfig = {
  label: "Condensation SARI",
  accent: "#059669",
  optimizeHref: "/admin/lab/condensation/sari/optimize",
  resultType: "binary",
  scoreEndpoint: "/api/lab/simulate-condensation-sari",
  rescoreIncludesSpecialty: true,
  showSpecialtyInSubtitle: false,
  regressionCommentPlaceholder: "Fx: Korrekt SARI-struktur — præcis og dækkende",
};

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

export default async function CondensationSariSimulatePage({ searchParams }: Props) {
  const { run_id } = await searchParams;

  if (!run_id) redirect("/admin/lab/condensation/sari/optimize");

  const admin = createAdminClient();

  type RunResult = { data: RawRun | null; error: unknown };
  const { data: run } = await (
    admin
      .from("model_optimization_runs")
      .select("id, specialty, module, base_version, improved_prompt, fp_count, fn_count, created_at")
      .eq("id", run_id)
      .single() as unknown as Promise<RunResult>
  );

  if (!run) redirect("/admin/lab/condensation/sari/optimize");

  const [{ data: rawDecisions }, { data: rawAgreementData }] = await Promise.all([
    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, disagreement_reason, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "condensation_sari")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: false }),

    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "condensation_sari")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: false })
      .limit(300),
  ]);

  const decisions     = (rawDecisions     ?? []) as RawDecision[];
  const agreementData = (rawAgreementData ?? []) as RawDecision[];

  // Disagreements: human rejected — deduplicate, cap at 50
  const seenIds = new Set<string>();
  const disagreements: SimulationDisagreement[] = [];

  for (const d of decisions) {
    if (
      d.decision === "rejected" &&
      d.article_id &&
      d.articles?.title &&
      !seenIds.has(d.article_id)
    ) {
      seenIds.add(d.article_id);
      disagreements.push({
        article_id:          d.article_id,
        title:               d.articles.title,
        journal_title:       d.articles.journal_title ?? null,
        human_decision:      d.decision,
        old_ai_decision:     d.ai_decision,
        old_ai_confidence:   d.ai_confidence ?? null,
        disagreement_reason: d.disagreement_reason ?? null,
      });
      if (disagreements.length >= 50) break;
    }
  }

  // Agreements: both approved — no overlap with disagreements, cap at 50
  const agreementArticles: SimulationAgreement[] = [];

  for (const d of agreementData) {
    if (
      d.decision === d.ai_decision &&
      d.decision === "approved" &&
      d.article_id &&
      d.articles?.title &&
      !seenIds.has(d.article_id)
    ) {
      seenIds.add(d.article_id);
      agreementArticles.push({
        article_id:        d.article_id,
        title:             d.articles.title,
        journal_title:     d.articles.journal_title ?? null,
        human_decision:    d.decision,
        old_ai_decision:   d.ai_decision,
        old_ai_confidence: d.ai_confidence ?? null,
      });
      if (agreementArticles.length >= 50) break;
    }
  }

  return (
    <SimulatorClient
      runId={run.id}
      specialty={run.specialty}
      module="condensation_sari"
      baseVersion={run.base_version}
      initialPrompt={run.improved_prompt ?? ""}
      disagreements={disagreements}
      agreementArticles={agreementArticles}
      config={CONFIG}
    />
  );
}
