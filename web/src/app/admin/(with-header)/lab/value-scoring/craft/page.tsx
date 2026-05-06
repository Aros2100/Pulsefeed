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

const ACCENT = "#E83B2A";

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
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#b91c1c" }}>
              Module not found in lab_modules. Please ensure the craft value-scoring module is pre-created.
            </div>
            <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: ACCENT }}>
              ← Back to Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentPhase = mod.phase as Phase;
  const currentIdx   = PHASES.indexOf(currentPhase);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: ACCENT, textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
            The Lab · Value Scoring
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Craft</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Score artikelhåndværk via pairwise comparisons. Pairwise-data danner grundlag for en prompt der kan score nye artikler enkeltvis.
          </p>
        </div>

        {/* Module info card */}
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          overflow: "hidden",
          marginBottom: "20px",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Module info
            </span>
          </div>
          <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
            {[
              { label: "Module type", value: "Value Scoring" },
              { label: "Parameter",   value: "Craft" },
              { label: "Specialty",   value: mod.specialty.charAt(0).toUpperCase() + mod.specialty.slice(1) },
              { label: "Status",      value: (mod.status as string).charAt(0).toUpperCase() + (mod.status as string).slice(1) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  {label}
                </div>
                <div style={{ fontSize: "15px", fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase progression */}
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Phase progression
            </span>
          </div>
          <div style={{ padding: "20px 24px" }}>

            {/* Progress track */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: "28px", gap: 0 }}>
              {PHASES.map((phase, i) => {
                const isDone    = i < currentIdx;
                const isActive  = i === currentIdx;
                const isFuture  = i > currentIdx;
                const isLast    = i === PHASES.length - 1;
                return (
                  <div key={phase} style={{ display: "flex", alignItems: "center", flex: isLast ? undefined : 1 }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700,
                      background: isActive ? ACCENT : isDone ? "#059669" : "#e5e7eb",
                      color: (isActive || isDone) ? "#fff" : "#94a3b8",
                      border: isActive ? `2px solid ${ACCENT}` : "none",
                    }}>
                      {isDone ? "✓" : i + 1}
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: isActive ? 700 : 400, color: isActive ? ACCENT : isDone ? "#059669" : "#94a3b8", marginLeft: "6px", whiteSpace: "nowrap" }}>
                      {PHASE_LABELS[phase]}
                    </div>
                    {!isLast && (
                      <div style={{ flex: 1, height: "1px", background: isDone ? "#059669" : "#e5e7eb", margin: "0 10px" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Phase cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {PHASES.map((phase, i) => {
                const isDone   = i < currentIdx;
                const isActive = i === currentIdx;
                const href     = PHASE_HREFS[phase];

                const card = (
                  <div style={{
                    border: isActive ? `1.5px solid ${ACCENT}` : "1px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isActive ? "#fff8f7" : "#fff",
                    opacity: !isActive && !isDone ? 0.5 : 1,
                    cursor: isActive && href ? "pointer" : "default",
                    transition: "box-shadow 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{
                        width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "10px", fontWeight: 700,
                        background: isActive ? ACCENT : isDone ? "#059669" : "#e5e7eb",
                        color: (isActive || isDone) ? "#fff" : "#94a3b8",
                      }}>
                        {isDone ? "✓" : i + 1}
                      </span>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: isActive ? 700 : 500, color: isActive ? ACCENT : isDone ? "#374151" : "#94a3b8" }}>
                          {PHASE_LABELS[phase]}
                        </div>
                        {isDone && (
                          <div style={{ fontSize: "11px", color: "#059669", marginTop: "1px" }}>Færdig</div>
                        )}
                        {isActive && (
                          <div style={{ fontSize: "11px", color: ACCENT, marginTop: "1px" }}>Aktiv fase</div>
                        )}
                      </div>
                    </div>
                    {isActive && href && (
                      <span style={{ fontSize: "12px", fontWeight: 600, color: ACCENT }}>
                        Åbn {PHASE_LABELS[phase]} →
                      </span>
                    )}
                    {isDone && href && (
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Se historik →</span>
                    )}
                  </div>
                );

                return (isActive || isDone) && href ? (
                  <Link key={phase} href={href} style={{ textDecoration: "none" }}>
                    {card}
                  </Link>
                ) : (
                  <div key={phase}>{card}</div>
                );
              })}
            </div>

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
