import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";

const PHASES = ["sample", "pairwise", "prompt", "evaluation", "promoted"] as const;
type Phase = (typeof PHASES)[number];

const PHASE_LABELS: Record<Phase, string> = {
  sample:     "Sample",
  pairwise:   "Pairwise",
  prompt:     "Prompt",
  evaluation: "Evaluation",
  promoted:   "Promoted",
};

const PHASE_HREFS: Partial<Record<Phase, string>> = {
  sample: "/admin/lab/value-scoring/craft/sample",
};

export default async function CraftModulePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, module_type, parameter, specialty, status, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#b91c1c" }}>
              Module not found. Ensure the craft value-scoring module has been created in lab_modules.
            </div>
            <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: "#E83B2A" }}>
              ← Back to Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentPhase = mod.phase as Phase;
  const currentIdx   = PHASES.indexOf(currentPhase);
  const specialty    = (mod.specialty as string).charAt(0).toUpperCase() + (mod.specialty as string).slice(1);
  const status       = (mod.status   as string).charAt(0).toUpperCase() + (mod.status   as string).slice(1);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Craft</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: "0 0 4px" }}>
            Score article craft via pairwise comparisons. Pairwise data forms the basis for a prompt that can score new articles individually.
          </p>
          <p style={{ fontSize: "12px", color: "#aaa", margin: 0 }}>
            Value Scoring · Craft · {specialty} · {status}
          </p>
        </div>

        {/* Phase progression — single card, SectionCard style */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Phase progression
            </span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {PHASES.map((phase, i) => {
              const isDone   = i < currentIdx;
              const isActive = i === currentIdx;
              const href     = PHASE_HREFS[phase];
              const isLast   = i === PHASES.length - 1;

              const row = (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 24px",
                  borderBottom: isLast ? "none" : "1px solid #f5f5f5",
                  opacity: !isActive && !isDone ? 0.45 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{
                      width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700,
                      background: isActive ? "#E83B2A" : isDone ? "#059669" : "#e5e7eb",
                      color: (isActive || isDone) ? "#fff" : "#94a3b8",
                    }}>
                      {isDone ? "✓" : i + 1}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: isActive ? 500 : 400, color: isDone ? "#374151" : isActive ? "#1a1a1a" : "#94a3b8" }}>
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isDone && (
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#059669", background: "#f0fdf4", borderRadius: "4px", padding: "2px 8px" }}>
                        Done
                      </span>
                    )}
                    {isActive && href && (
                      <span style={{ fontSize: "13px", color: "#E83B2A" }}>Open →</span>
                    )}
                    {isDone && href && (
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>History →</span>
                    )}
                  </div>
                </div>
              );

              return (isActive || isDone) && href ? (
                <Link key={phase} href={href} style={{ textDecoration: "none", display: "block" }}>
                  {row}
                </Link>
              ) : (
                <div key={phase}>{row}</div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <Link href="/admin/lab" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to Lab
          </Link>
        </div>
      </div>
    </div>
  );
}
