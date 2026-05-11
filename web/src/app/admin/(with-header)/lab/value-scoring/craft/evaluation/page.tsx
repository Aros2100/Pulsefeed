import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, DISAGREEMENT_MIN_DIFF } from "@/lib/lab/value-scoring/craft-config";
import { getPromptVersions } from "@/lib/lab/value-scoring/prompt-versions";
import {
  computePairMatch,
  computeRankingCorrelation,
  getDisagreements,
} from "@/lib/lab/value-scoring/evaluation";
import EvaluationFilters from "./EvaluationFilters";
import DisagreementList, { type ArticleFull } from "./DisagreementList";

interface PageProps {
  searchParams: Promise<{ promptId?: string; minScoreDiff?: string }>;
}

export default async function EvaluationPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) {
    return shell(
      <div style={{ background: "#fff", borderRadius: "10px", padding: "32px", textAlign: "center", fontSize: "14px", color: "#5a6a85" }}>
        Module not found.
      </div>,
    );
  }

  const allVersions = await getPromptVersions(admin, mod.id as string);
  const fullyScored = allVersions.filter(v => v.status === "scored");

  if (fullyScored.length === 0) {
    return shell(
      <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px 20px", fontSize: "13px", color: "#92400e" }}>
        No fully-scored prompt versions yet. Finish scoring a version before opening evaluation.
        <div style={{ marginTop: "10px" }}>
          <Link href="/admin/lab/value-scoring/craft/prompt" style={{ fontSize: "13px", color: "#E83B2A" }}>
            ← Back to prompt list
          </Link>
        </div>
      </div>,
    );
  }

  const promptId = (sp.promptId && fullyScored.some(v => v.id === sp.promptId))
    ? sp.promptId
    : fullyScored[0].id;
  const minScoreDiff = sp.minScoreDiff !== undefined && !Number.isNaN(Number(sp.minScoreDiff))
    ? Math.max(0, Number(sp.minScoreDiff))
    : DISAGREEMENT_MIN_DIFF;

  const [pairMatch, correlation, disagreements] = await Promise.all([
    computePairMatch(admin, promptId),
    computeRankingCorrelation(admin, promptId),
    getDisagreements(admin, promptId, { minScoreDiff }),
  ]);

  // Pre-fetch full article fields for every article appearing in the disagreement list
  const articleIds = new Set<string>();
  for (const d of disagreements) {
    articleIds.add(d.articleA.id);
    articleIds.add(d.articleB.id);
  }
  const articles: Record<string, ArticleFull> = {};
  if (articleIds.size > 0) {
    const { data: rows } = await admin
      .from("lab_value_articles")
      .select("id, title, journal, article_type, published_date, pmid, short_headline, resume, bottom_line, sari")
      .in("id", [...articleIds]);
    for (const r of (rows ?? []) as ArticleFull[]) articles[r.id] = r;
  }

  const selectedVersion = fullyScored.find(v => v.id === promptId)!;

  return shell(
    <>
      <EvaluationFilters
        versions={fullyScored.map(v => ({ id: v.id, version: v.version, scoredCount: v.scoredCount, articleCount: v.articleCount }))}
        promptId={promptId}
        minScoreDiff={minScoreDiff}
      />

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <MetricCard
          title="Pair-match"
          value={`${pairMatch.matchPercent.toFixed(1)}%`}
          subtitle={`Prompt matched your choice on ${pairMatch.matches} of ${pairMatch.totalPairs} pairs${pairMatch.ties > 0 ? ` · ${pairMatch.ties} ties` : ""}`}
          accent={pairMatch.matchPercent >= 75 ? "#059669" : pairMatch.matchPercent >= 60 ? "#92400e" : "#b91c1c"}
        />
        <MetricCard
          title="Ranking correlation"
          value={correlation.rho.toFixed(2)}
          subtitle={`Spearman ρ between prompt scores and β · ${correlation.n} articles`}
          accent={correlation.rho >= 0.7 ? "#059669" : correlation.rho >= 0.4 ? "#92400e" : "#b91c1c"}
        />
      </div>

      {/* Disagreements card */}
      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
            Disagreements · v{selectedVersion.version} · {disagreements.length} shown (score diff ≥ {minScoreDiff})
          </span>
        </div>
        <DisagreementList rows={disagreements} articles={articles} />
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
        <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
          ← Back to module
        </Link>
        <Link href={`/admin/lab/value-scoring/craft/prompt/new?from=${promptId}`} style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none" }}>
          Create new version from v{selectedVersion.version} →
        </Link>
      </div>
    </>,
  );
}

function MetricCard({ title, value, subtitle, accent }: { title: string; value: string; subtitle: string; accent: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
        {title}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: "6px" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#5a6a85" }}>{subtitle}</div>
    </div>
  );
}

function shell(children: React.ReactNode) {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Evaluation</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Test how well the prompt matches your pairwise choices and overall ranking.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
