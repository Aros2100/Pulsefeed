import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function accColor(v: number | null): string {
  if (v == null) return "#888";
  if (v >= 85) return "#15803d";
  if (v >= 70) return "#d97706";
  return "#dc2626";
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface VersionStats {
  version: string;
  active: boolean;
  activatedAt: string;
  deactivatedAt: string | null;
  decisions: number;
  agreements: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  fpRate: number | null;
  fnRate: number | null;
  confBuckets: { label: string; count: number }[];
  topReasons: { reason: string; count: number }[];
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user!.id).single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec =
    SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ??
    SPECIALTIES.find((s) => s.active);
  const specialty = activeSpec?.slug ?? "neurosurgery";

  const admin = createAdminClient();

  const [versionsRes, decisionsRes] = await Promise.all([
    admin
      .from("model_versions")
      .select("version, activated_at, active")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("activated_at", { ascending: false }),
    admin
      .from("lab_decisions")
      .select("model_version, ai_decision, decision, ai_confidence, disagreement_reason")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);

  const rawVersions = versionsRes.data ?? [];
  const decisions = decisionsRes.data ?? [];

  // Group decisions by model_version
  const groups: Record<string, typeof decisions> = {};
  for (const d of decisions) {
    const mv = d.model_version as string | null;
    if (!mv) continue;
    (groups[mv] ??= []).push(d);
  }

  const bucketDefs = [
    { label: "90–100%", min: 90, max: 100 },
    { label: "80–89%",  min: 80, max: 89 },
    { label: "70–79%",  min: 70, max: 79 },
    { label: "60–69%",  min: 60, max: 69 },
    { label: "<60%",    min: 0,  max: 59 },
  ];

  // Build per-version stats (raw order = activated_at DESC)
  const versions: VersionStats[] = rawVersions.map((v, i) => {
    const ds = groups[v.version as string] ?? [];
    const total = ds.length;
    const correct = ds.filter((d) => d.ai_decision === d.decision).length;
    const fp = ds.filter((d) => d.ai_decision === "approved" && d.decision === "rejected").length;
    const fn = ds.filter((d) => d.ai_decision === "rejected" && d.decision === "approved").length;

    const confidences = ds
      .map((d) => d.ai_confidence as number | null)
      .filter((c): c is number => c != null);

    const confBuckets = bucketDefs.map((b) => ({
      label: b.label,
      count: confidences.filter((c) => c >= b.min && c <= b.max).length,
    }));

    const reasonMap: Record<string, number> = {};
    for (const d of ds) {
      if (d.decision !== d.ai_decision && d.disagreement_reason) {
        const r = d.disagreement_reason as string;
        reasonMap[r] = (reasonMap[r] ?? 0) + 1;
      }
    }
    const topReasons = Object.entries(reasonMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return {
      version:       v.version as string,
      active:        v.active as boolean,
      activatedAt:   v.activated_at as string,
      deactivatedAt: (v.active as boolean) ? null : (i === 0 ? null : rawVersions[i - 1].activated_at as string),
      decisions:     total,
      agreements:    correct,
      fp, fn,
      accuracy: pct(correct, total),
      fpRate:   pct(fp, total),
      fnRate:   pct(fn, total),
      confBuckets,
      topReasons,
    };
  });

  // Sort: active first, then keep activated_at DESC order
  versions.sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return 0;
  });

  // Chart: chronological order (oldest → newest)
  const chartVersions = [...versions].sort(
    (a, b) => new Date(a.activatedAt).getTime() - new Date(b.activatedAt).getTime()
  );

  // ── Styles ────────────────────────────────────────────────────────────────

  const barHeight = 180;

  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
    marginBottom: "16px",
  };

  const cardHeader: React.CSSProperties = {
    background: "#EEF2F7",
    borderBottom: "1px solid #dde3ed",
    padding: "10px 24px",
    fontSize: "11px",
    letterSpacing: "0.08em",
    color: "#5a6a85",
    textTransform: "uppercase",
    fontWeight: 700,
  };

  const gridCols = "120px 100px 100px 55px 55px 100px 1fr";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← The Lab
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginTop: "16px", marginBottom: "6px" }}>
            Performance
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Model benchmark
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Nøjagtighed og fejlanalyse pr. model-version
          </p>
        </div>

        {/* 1 ── Bar chart */}
        <div style={card}>
          <div style={cardHeader}>Nøjagtighed pr. version</div>
          <div style={{ padding: "24px" }}>
            {chartVersions.length === 0 ? (
              <div style={{ height: barHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "13px" }}>
                Ingen versioner endnu
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", justifyContent: "center" }}>
                  {chartVersions.map((v) => {
                    const correctRate = v.accuracy ?? 0;
                    const fpr = v.fpRate ?? 0;
                    const fnr = v.fnRate ?? 0;
                    const isEmpty = v.decisions === 0;

                    return (
                      <div key={v.version} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flex: 1, maxWidth: "100px" }}>
                        <div
                          style={{
                            width: "100%",
                            height: `${barHeight}px`,
                            background: "#f0f2f5",
                            borderRadius: "6px",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            border: v.active ? "2px solid #15803d" : "1px solid #e2e8f0",
                          }}
                        >
                          {!isEmpty && (
                            <>
                              <div
                                style={{ flex: `${correctRate} 0 0`, background: v.active ? "#86efac" : "#bbf7d0" }}
                                title={`Korrekt: ${correctRate}%`}
                              />
                              {fnr > 0 && (
                                <div
                                  style={{ flex: `${fnr} 0 0`, background: "#fde68a", minHeight: "2px" }}
                                  title={`FN: ${fnr}% (${v.fn})`}
                                />
                              )}
                              {fpr > 0 && (
                                <div
                                  style={{ flex: `${fpr} 0 0`, background: "#fecaca", minHeight: "2px" }}
                                  title={`FP: ${fpr}% (${v.fp})`}
                                />
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: v.active ? "#15803d" : "#5a6a85" }}>
                          {v.version}
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: accColor(v.accuracy) }}>
                          {v.accuracy != null ? `${v.accuracy}%` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "16px", fontSize: "11px", color: "#888" }}>
                  <span>
                    <span style={{ display: "inline-block", width: "10px", height: "10px", background: "#bbf7d0", borderRadius: "2px", marginRight: "4px", verticalAlign: "middle" }} />
                    Korrekt
                  </span>
                  <span>
                    <span style={{ display: "inline-block", width: "10px", height: "10px", background: "#fde68a", borderRadius: "2px", marginRight: "4px", verticalAlign: "middle" }} />
                    Falsk negativ
                  </span>
                  <span>
                    <span style={{ display: "inline-block", width: "10px", height: "10px", background: "#fecaca", borderRadius: "2px", marginRight: "4px", verticalAlign: "middle" }} />
                    Falsk positiv
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2 ── Version comparison table */}
        <div style={card}>
          <div style={cardHeader}>Versions-sammenligning</div>
          {versions.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "13px", color: "#aaa" }}>Ingen versioner endnu.</div>
          ) : (
            <div>
              {/* Column headers */}
              <div style={{
                display: "grid", gridTemplateColumns: gridCols,
                padding: "10px 24px", borderBottom: "1px solid #f0f2f5",
                fontSize: "11px", color: "#888", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                <div>Version</div>
                <div>Beslutninger</div>
                <div>Agreement</div>
                <div>FP</div>
                <div>FN</div>
                <div>Nøjagtighed</div>
                <div>Periode</div>
              </div>

              {/* Rows */}
              {versions.map((v) => (
                <details key={v.version} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <summary style={{
                    display: "grid", gridTemplateColumns: gridCols,
                    padding: "14px 24px", cursor: "pointer",
                    listStyle: "none", fontSize: "13px", alignItems: "center",
                  }}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      {v.version}
                      {v.active && (
                        <span style={{ fontSize: "10px", fontWeight: 700, background: "#15803d", color: "#fff", borderRadius: "3px", padding: "1px 5px" }}>
                          Aktiv
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#5a6a85" }}>{v.decisions}</div>
                    <div>{v.agreements}</div>
                    <div style={{ color: v.fp > 0 ? "#dc2626" : "#aaa" }}>{v.fp}</div>
                    <div style={{ color: v.fn > 0 ? "#d97706" : "#aaa" }}>{v.fn}</div>
                    <div style={{ fontWeight: 700, color: accColor(v.accuracy) }}>
                      {v.accuracy != null ? `${v.accuracy}%` : "—"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      {fmtDate(v.activatedAt)} → {v.active ? "nu" : fmtDate(v.deactivatedAt)}
                    </div>
                  </summary>

                  {/* Expanded details */}
                  <div style={{ padding: "0 24px 20px 24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

                      {/* Confidence distribution */}
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                          Confidence-fordeling
                        </div>
                        {v.confBuckets.every((b) => b.count === 0) ? (
                          <div style={{ fontSize: "12px", color: "#aaa" }}>Ingen data</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {v.confBuckets.map((b) => {
                              const maxCount = Math.max(...v.confBuckets.map((x) => x.count), 1);
                              const w = Math.round((b.count / maxCount) * 100);
                              return (
                                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div style={{ fontSize: "11px", color: "#888", width: "60px", textAlign: "right", flexShrink: 0 }}>
                                    {b.label}
                                  </div>
                                  <div style={{ flex: 1, height: "14px", background: "#f0f2f5", borderRadius: "3px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${w}%`, background: "#93c5fd", borderRadius: "3px", transition: "width 0.2s" }} />
                                  </div>
                                  <div style={{ fontSize: "11px", color: "#5a6a85", width: "30px", flexShrink: 0 }}>
                                    {b.count}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Top rejection reasons */}
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                          Hyppigste afvisningsårsager
                        </div>
                        {v.topReasons.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "#aaa" }}>Ingen uenigheder med årsag</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {v.topReasons.map((r, i) => (
                              <div key={i} style={{ fontSize: "12px", color: "#1a1a1a", display: "flex", gap: "6px" }}>
                                <span style={{ color: "#aaa" }}>•</span>
                                <span style={{ flex: 1 }}>{r.reason}</span>
                                <span style={{ color: "#aaa", flexShrink: 0 }}>({r.count})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
