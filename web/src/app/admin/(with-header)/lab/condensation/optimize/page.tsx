import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import PatternAnalysis, { type OptimizationRun } from "@/components/lab/PatternAnalysis";

export default async function CondensationOptimizePage() {
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

  // Fetch active model version for condensation_text
  const { data: activeVersionData } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "condensation_text")
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
          .eq("module", "condensation_text")
          .eq("model_version", activeModelVersion)
          .not("ai_decision", "is", null)
      : admin
          .from("lab_decisions")
          .select("decision, ai_decision")
          .eq("specialty", specialty)
          .eq("module", "condensation_text")
          .not("ai_decision", "is", null)
    ),

    admin
      .from("model_optimization_runs")
      .select("id, base_version, total_decisions, fp_count, fn_count, fp_patterns, fn_patterns, recommended_changes, improved_prompt, created_at")
      .eq("specialty", specialty)
      .eq("module", "condensation_text")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // For condensation: disagreement = human rejected
  const totalDisagree = (decisionsRes.data ?? []).filter((d) => d.decision === "rejected").length;
  const latestRun     = (latestRunRes.data ?? null) as OptimizationRun | null;

  const versionSuffix = activeModelVersion ? ` · ${activeModelVersion}` : "";

  // threshold = 0 → always sufficient
  const dataBanner = {
    bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d",
    msg: `${totalDisagree} afvisninger${versionSuffix}`,
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/condensation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Kondensering
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#059669", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: "6px" }}>
            Prompt Optimization · Condensation
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Optimize Model · {specialtyLabel}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Identificér mønstre i afvisninger og generér en forbedret kondenseringsprompt
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
          module="condensation_text"
          initialRun={latestRun}
          disabled={false}
          accentColor="#059669"
          threshold={0}
          simulatePath="/admin/lab/condensation/simulate"
          placeholder="Fx: 'Vær mere neutral i formuleringen' eller 'Undgå at fortolke statistik'"
        />

      </div>
    </div>
  );
}
