import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type SimulationDisagreement, type SimulationAgreement, type SimulatorConfig } from "@/components/lab/SimulatorClient";

const CONFIG: SimulatorConfig = {
  label: "Classification",
  accent: "#7c3aed",
  optimizeHref: "/admin/lab/subspecialty/optimize",
  resultType: "tags",
  scoreEndpoint: "/api/lab/score-subspecialty",
  rescoreIncludesSpecialty: true,
  showSpecialtyInSubtitle: true,
  regressionCommentPlaceholder: "Fx: Korrekt — ren neurologi",
};

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* not JSON */ }
  return value ? [value] : [];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

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

export default async function ClassificationSimulatePage({ searchParams }: Props) {
  const { run_id } = await searchParams;

  if (!run_id) redirect("/admin/lab/subspecialty/optimize");

  const admin = createAdminClient();

  // Fetch the optimization run
  type RunResult = { data: RawRun | null; error: unknown };
  const { data: run } = await (
    admin
      .from("model_optimization_runs")
      .select("id, specialty, module, base_version, improved_prompt, fp_count, fn_count, created_at")
      .eq("id", run_id)
      .single() as unknown as Promise<RunResult>
  );

  if (!run) redirect("/admin/lab/subspecialty/optimize");

  // Fetch all decisions
  const [{ data: rawDecisions }, { data: rawAgreementData }] = await Promise.all([
    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, disagreement_reason, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "subspecialty")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: false }),

    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "subspecialty")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: false })
      .limit(300),
  ]);

  const decisions     = (rawDecisions     ?? []) as RawDecision[];
  const agreementData = (rawAgreementData ?? []) as RawDecision[];

  // Build disagreements — deduplicate, cap at 50
  const seenIds = new Set<string>();
  const disagreements: SimulationDisagreement[] = [];

  for (const d of decisions) {
    if (
      !arraysEqual(parseTags(d.decision), parseTags(d.ai_decision)) &&
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

  // Build regression sample — agreements only, no overlap, cap at 50
  const agreementArticles: SimulationAgreement[] = [];

  for (const d of agreementData) {
    if (
      arraysEqual(parseTags(d.decision), parseTags(d.ai_decision)) &&
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
      module={run.module}
      baseVersion={run.base_version}
      initialPrompt={run.improved_prompt ?? ""}
      disagreements={disagreements}
      agreementArticles={agreementArticles}
      config={CONFIG}
    />
  );
}
