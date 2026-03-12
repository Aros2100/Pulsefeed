import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import PatternAnalysis, { type OptimizationRun } from "../../specialty-tag/dashboard/PatternAnalysis";

export default async function ClassificationOptimizePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user!.id)
    .single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec =
    SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ??
    SPECIALTIES.find((s) => s.active);

  const specialty      = activeSpec?.slug  ?? "neurosurgery";
  const specialtyLabel = activeSpec?.label ?? "Neurosurgery";

  const admin = createAdminClient();

  // Fetch active model version first (needed to scope disagreement count)
  const { data: activeVersionData } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "classification_subspecialty")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const activeModelVersion = (activeVersionData?.version as string | null) ?? null;

  const [decisionsRes, latestRunRes] = await Promise.all([
    (activeModelVersion
      ? admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", specialty)
          .eq("module", "classification_subspecialty")
          .eq("model_version", activeModelVersion)
          .not("ai_decision", "is", null)
      : admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", specialty)
          .eq("module", "classification_subspecialty")
          .not("ai_decision", "is", null)
    ),

    admin
      .from("model_optimization_runs" as never)
      .select("id, base_version, total_decisions, fp_count, fn_count, fp_patterns, fn_patterns, recommended_changes, improved_prompt, created_at")
      .eq("specialty", specialty)
      .eq("module", "classification_subspecialty")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalDisagree = (decisionsRes.data ?? []).filter((d) => d.decision !== d.ai_decision).length;
  const latestRun     = (latestRunRes.data ?? null) as OptimizationRun | null;

  const versionSuffix = activeModelVersion ? ` · ${activeModelVersion}` : "";
  const hasSufficientData = totalDisagree >= 50;
  const dataBanner = totalDisagree < 50
    ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Insufficient data — need at least 50 disagreements to identify reliable trends (${totalDisagree} so far${versionSuffix})` }
    : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Sufficient data for reliable trend analysis (${totalDisagree} disagreements${versionSuffix})` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/classification/evaluation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Prompt Evaluation
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Optimization · Classification
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Optimize Model · {specialtyLabel}
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
          specialty={specialty}
          module="classification_subspecialty"
          initialRun={latestRun}
          disabled={!hasSufficientData}
        />

      </div>
    </div>
  );
}
