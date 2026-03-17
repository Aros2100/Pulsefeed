import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ArticleTypeSimulatorClient, { type SimulationDisagreement, type SimulationAgreement } from "./ArticleTypeSimulatorClient";

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

function parseSingle(value: string): string[] {
  // For article_type, decisions are plain strings (not JSON arrays)
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (typeof parsed === "string") return [parsed];
  } catch { /* not JSON */ }
  return [value];
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

export default async function ArticleTypeSimulatePage({ searchParams }: Props) {
  const { run_id } = await searchParams;

  if (!run_id) redirect("/admin/lab/article-type/optimize");

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

  if (!run) redirect("/admin/lab/article-type/optimize");

  // Fetch all decisions
  const [{ data: rawDecisions }, { data: rawAgreementData }] = await Promise.all([
    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, disagreement_reason, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "article_type")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: false }),

    admin
      .from("lab_decisions")
      .select("decision, ai_decision, ai_confidence, article_id, articles(title, journal_title)")
      .eq("specialty", run.specialty)
      .eq("module", "article_type")
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
      !arraysEqual(parseSingle(d.decision), parseSingle(d.ai_decision)) &&
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
      arraysEqual(parseSingle(d.decision), parseSingle(d.ai_decision)) &&
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
    <ArticleTypeSimulatorClient
      runId={run.id}
      specialty={run.specialty}
      module={run.module}
      baseVersion={run.base_version}
      initialPrompt={run.improved_prompt ?? ""}
      disagreements={disagreements}
      agreementArticles={agreementArticles}
    />
  );
}
