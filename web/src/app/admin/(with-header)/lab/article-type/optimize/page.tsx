import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PatternAnalysis, { type OptimizationRun } from "../dashboard/PatternAnalysis";
import { ARTICLE_TYPE_DISAGREEMENT_THRESHOLD } from "@/lib/lab/article-type-options";

const FIXED_SPECIALTY = "neurosurgery";

export default async function ArticleTypeOptimizePage() {
  const supabase = await createClient();
  await supabase.auth.getUser();

  const admin = createAdminClient();

  // Fetch active model version first
  const { data: activeVersionData } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", FIXED_SPECIALTY)
    .eq("module", "article_type")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const activeModelVersion = (activeVersionData?.version as string | null) ?? null;

  const [decisionsRes, latestRunRes] = await Promise.all([
    (activeModelVersion
      ? admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", FIXED_SPECIALTY)
          .eq("module", "article_type")
          .eq("model_version", activeModelVersion)
          .not("ai_decision", "is", null)
      : admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", FIXED_SPECIALTY)
          .eq("module", "article_type")
          .not("ai_decision", "is", null)
    ),

    admin
      .from("model_optimization_runs")
      .select("id, base_version, total_decisions, fp_count, fn_count, fp_patterns, fn_patterns, recommended_changes, improved_prompt, created_at")
      .eq("specialty", FIXED_SPECIALTY)
      .eq("module", "article_type")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalDisagree = (decisionsRes.data ?? []).filter((d) => d.decision !== d.ai_decision).length;
  const latestRun     = (latestRunRes.data ?? null) as OptimizationRun | null;

  const versionSuffix = activeModelVersion ? ` · ${activeModelVersion}` : "";
  const hasSufficientData = totalDisagree >= ARTICLE_TYPE_DISAGREEMENT_THRESHOLD;
  const dataBanner = totalDisagree < ARTICLE_TYPE_DISAGREEMENT_THRESHOLD
    ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Insufficient data — need at least ${ARTICLE_TYPE_DISAGREEMENT_THRESHOLD} disagreements to identify reliable trends (${totalDisagree} so far${versionSuffix})` }
    : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Sufficient data for reliable trend analysis (${totalDisagree} disagreements${versionSuffix})` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/article-type/evaluation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Prompt Evaluation
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Optimization · Article Type
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Optimize Model · Article Type
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Identify patterns in AI/human disagreements and generate an improved prompt
          </p>
        </div>

        {/* Data sufficiency banner */}
        <div style={{ background: dataBanner.bg, border: `1px solid ${dataBanner.border}`, borderRadius: "8px", padding: "10px 16px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dataBanner.dot, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: "13px", color: dataBanner.text, fontWeight: 500 }}>{dataBanner.msg}</span>
        </div>

        {/* Pattern analysis */}
        <PatternAnalysis
          specialty={FIXED_SPECIALTY}
          module="article_type"
          initialRun={latestRun}
          disabled={!hasSufficientData}
        />

      </div>
    </div>
  );
}
