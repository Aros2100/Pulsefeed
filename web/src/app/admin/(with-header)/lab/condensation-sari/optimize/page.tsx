import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import PatternAnalysis, { type OptimizationRun } from "@/components/lab/PatternAnalysis";

export default async function CondensationSariOptimizePage() {
  const specialty = ACTIVE_SPECIALTY;
  const specialtyLabel = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  const admin = createAdminClient();

  // Fetch active model version for condensation_sari
  const { data: activeVersionData } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "condensation_sari")
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
          .eq("module", "condensation_sari")
          .eq("model_version", activeModelVersion)
          .not("ai_decision", "is", null)
      : admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", specialty)
          .eq("module", "condensation_sari")
          .not("ai_decision", "is", null)
    ),

    admin
      .from("model_optimization_runs")
      .select("id, base_version, total_decisions, fp_count, fn_count, fp_patterns, fn_patterns, recommended_changes, improved_prompt, created_at")
      .eq("specialty", specialty)
      .eq("module", "condensation_sari")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalDisagree = (decisionsRes.data ?? []).filter((d) => d.decision === "rejected").length;
  const latestRun     = (latestRunRes.data ?? null) as OptimizationRun | null;

  const versionSuffix = activeModelVersion ? ` · ${activeModelVersion}` : "";

  const dataBanner = {
    bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d",
    msg: `${totalDisagree} afvisninger${versionSuffix}`,
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/condensation-sari" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Kondensering
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#059669", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: "6px" }}>
            Prompt Optimization · Condensation SARI
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Optimize Model · {specialtyLabel}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Identificér mønstre i afvisninger og generér en forbedret SARI-prompt
          </p>
        </div>

        {/* Data banner */}
        <div style={{ background: dataBanner.bg, border: `1px solid ${dataBanner.border}`, borderRadius: "8px", padding: "10px 16px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dataBanner.dot, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: "13px", color: dataBanner.text, fontWeight: 500 }}>{dataBanner.msg}</span>
        </div>

        {/* Pattern analysis */}
        <PatternAnalysis
          specialty={specialty}
          module="condensation_sari"
          initialRun={latestRun}
          disabled={false}
          accentColor="#059669"
          threshold={0}
          simulatePath="/admin/lab/condensation-sari/simulate"
          placeholder="Fx: 'Vær mere præcis i Subject-feltet' eller 'Undgå at fortolke implication'"
          fpLabel="Kvalitetsproblemer — tilbagevendende SARI-fejl"
          fnLabel="Indholdsgab — hvad AI'en overser i SARI"
        />

      </div>
    </div>
  );
}
