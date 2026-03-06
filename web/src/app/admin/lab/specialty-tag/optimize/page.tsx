import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import PatternAnalysis from "../dashboard/PatternAnalysis";

export default async function OptimizePage() {
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

  // Count disagreements for the data sufficiency banner
  const { data: rawDecisions } = await admin
    .from("lab_decisions")
    .select("decision, ai_decision")
    .eq("specialty", specialty)
    .eq("module", "specialty_tag")
    .not("ai_decision", "is", null);

  const totalDisagree = (rawDecisions ?? []).filter((d) => d.decision !== d.ai_decision).length;

  const hasSufficientData = totalDisagree >= 50;
  const dataBanner =
    totalDisagree < 50
      ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Insufficient data — need at least 50 disagreements to identify reliable trends (${totalDisagree} so far)` }
      : totalDisagree < 100
      ? { bg: "#fefce8", border: "#fde68a", dot: "#d97706", text: "#92400e", msg: `Limited data — trends may not be fully representative (${totalDisagree} disagreements)` }
      : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Sufficient data for reliable trend analysis (${totalDisagree} disagreements)` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/specialty-tag/evaluation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Prompt Evaluation
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Optimization · Specialty Tag
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

        {/* Pattern analysis card */}
        {hasSufficientData ? (
          <PatternAnalysis specialty={specialty} module="specialty_tag" />
        ) : (
          <div style={{
            background: "#fff", borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}>
            <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700 }}>
                AI Mønsteranalyse
              </span>
            </div>
            <div style={{ padding: "24px", fontSize: "13px", color: "#aaa" }}>
              Collect at least 50 disagreements in the training sessions before running the analysis.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
