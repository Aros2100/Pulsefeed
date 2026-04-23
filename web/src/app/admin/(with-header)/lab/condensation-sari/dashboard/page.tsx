import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import BenchmarkTable from "@/components/lab/BenchmarkTable";

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
  if (v >= 85) return "#16a34a";
  if (v >= 70) return "#ea580c";
  return "#dc2626";
}

const ACTIVE_MODULE = "condensation_sari";

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
  confBuckets: { label: string; count: number }[];
  topReasons: { reason: string; count: number }[];
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CondensationDashboardPage() {
  const activeModule = ACTIVE_MODULE;

  const specialty = ACTIVE_SPECIALTY;

  const admin = createAdminClient();

  // Model versions
  const versionsRes = await admin
    .from("model_versions")
    .select("version, activated_at, active")
    .eq("specialty", specialty)
    .eq("module", "condensation_sari")
    .order("activated_at", { ascending: false });

  const rawVersions = versionsRes.data ?? [];

  // Paginate lab_decisions for the selected module
  type Decision = {
    model_version: string | null;
    ai_decision: string;
    decision: string;
    ai_confidence: number | null;
    disagreement_reason: string | null;
  };
  const decisions: Decision[] = [];
  for (let from = 0; ; ) {
    const { data } = await admin
      .from("lab_decisions")
      .select("model_version, ai_decision, decision, ai_confidence, disagreement_reason")
      .eq("specialty", specialty)
      .eq("module", activeModule)
      .not("ai_decision", "is", null)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    decisions.push(...(data as Decision[]));
    if (data.length < 1000) break;
    from += 1000;
  }

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

  // Build per-version stats
  const allVersions: VersionStats[] = rawVersions.map((v, i) => {
    const ds = groups[v.version as string] ?? [];
    const total = ds.length;
    const approved = ds.filter((d) => d.decision === "approved").length;
    const rejected = ds.filter((d) => d.decision === "rejected").length;

    const confidences = ds
      .map((d) => d.ai_confidence as number | null)
      .filter((c): c is number => c != null);

    const confBuckets = bucketDefs.map((b) => ({
      label: b.label,
      count: confidences.filter((c) => c >= b.min && c <= b.max).length,
    }));

    // Top rejection comments
    const reasonMap: Record<string, number> = {};
    for (const d of ds) {
      if (d.decision === "rejected" && d.disagreement_reason) {
        const r = d.disagreement_reason;
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
      agreements:    approved,
      fp:            rejected,
      fn:            0,
      accuracy:      pct(approved, total),
      fpRate:        pct(rejected, total),
      confBuckets,
      topReasons,
    };
  });

  // Chart: chronological, only versions with data
  const chartVersions = allVersions
    .filter((v) => v.decisions > 0)
    .sort((a, b) => new Date(a.activatedAt).getTime() - new Date(b.activatedAt).getTime());

  // Table
  const tableVersions = [...allVersions].sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return 0;
  });

  const tableRows = tableVersions.map((v) => ({
    version: v.version,
    active: v.active,
    decisions: v.decisions,
    agreements: v.agreements,
    fp: v.fp,
    fn: v.fn,
    accuracy: v.accuracy,
    period: `${fmtDate(v.activatedAt)} → ${v.active ? "nu" : fmtDate(v.deactivatedAt)}`,
    confBuckets: v.confBuckets,
    topReasons: v.topReasons,
  }));

  // ── Styles ────────────────────────────────────────────────────────────────

  const barHeight = 200;

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
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#059669", textTransform: "uppercase", fontWeight: 700, marginTop: "16px", marginBottom: "6px" }}>
            Performance
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Condensation Benchmark
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Godkendelsesrate og afvisningsanalyse pr. model-version
          </p>
        </div>

        {/* Bar chart */}
        <div style={card}>
          <div style={cardHeader}>Godkendelsesrate pr. version — SARI</div>
          <div style={{ padding: "24px 24px 20px" }}>
            {chartVersions.length === 0 ? (
              <div style={{ height: barHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "13px" }}>
                Ingen versioner med data
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "0" }}>
                  {/* Y-axis */}
                  <div style={{
                    display: "flex", flexDirection: "column", justifyContent: "space-between",
                    height: `${barHeight}px`, paddingRight: "10px", flexShrink: 0,
                  }}>
                    {[100, 80, 60, 40, 20, 0].map((tick) => (
                      <div key={tick} style={{ fontSize: "10px", color: "#aaa", textAlign: "right", width: "28px", lineHeight: "1" }}>
                        {tick}%
                      </div>
                    ))}
                  </div>

                  {/* Bars */}
                  <div style={{
                    flex: 1, display: "flex", alignItems: "flex-end",
                    gap: "16px", justifyContent: "center",
                    height: `${barHeight}px`,
                    borderLeft: "1px solid #e8ecf1",
                    borderBottom: "1px solid #e8ecf1",
                    position: "relative",
                    paddingBottom: "1px",
                  }}>
                    {[20, 40, 60, 80].map((tick) => (
                      <div key={tick} style={{
                        position: "absolute", bottom: `${tick}%`,
                        left: 0, right: 0, borderTop: "1px dashed #f0f2f5",
                      }} />
                    ))}

                    {chartVersions.map((v) => {
                      const acc = v.accuracy ?? 0;
                      const h = Math.max((acc / 100) * barHeight, 4);
                      const rejectedRate = v.fpRate;

                      return (
                        <div key={v.version} style={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          flex: 1, maxWidth: "80px", position: "relative", zIndex: 1,
                        }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: accColor(v.accuracy), marginBottom: "6px" }}>
                            {v.accuracy != null ? `${v.accuracy}%` : "—"}
                          </div>
                          <div style={{
                            width: "100%", height: `${h}px`,
                            borderRadius: "6px 6px 2px 2px",
                            background: v.active
                              ? "linear-gradient(180deg, #059669 0%, #047857 100%)"
                              : "#EEF2F7",
                            border: v.active ? "2px solid #059669" : "1px solid #dde3ed",
                            position: "relative",
                            display: "flex", flexDirection: "column", justifyContent: "flex-end",
                            alignItems: "center", padding: "0 4px 6px", overflow: "hidden",
                          }}>
                            {h >= 50 && (rejectedRate ?? 0) > 0 && (
                              <div style={{
                                fontSize: "9px", fontWeight: 700,
                                color: v.active ? "rgba(255,255,255,0.85)" : "#888",
                                textAlign: "center", lineHeight: 1.6,
                              }}>
                                <div>Afv. {rejectedRate}%</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* X-axis labels */}
                <div style={{ display: "flex", gap: "0", marginTop: "8px" }}>
                  <div style={{ width: "38px", flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", gap: "16px", justifyContent: "center" }}>
                    {chartVersions.map((v) => (
                      <div key={v.version} style={{
                        flex: 1, maxWidth: "80px", textAlign: "center",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
                      }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: v.active ? "#059669" : "#5a6a85" }}>
                          {v.version}
                        </div>
                        {v.active && (
                          <span style={{ fontSize: "9px", fontWeight: 700, background: "#059669", color: "#fff", borderRadius: "3px", padding: "1px 5px" }}>
                            Aktiv
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div style={{ display: "flex", gap: "20px", justifyContent: "center", marginTop: "16px", fontSize: "11px", color: "#5a6a85" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ display: "inline-block", width: "12px", height: "12px", background: "linear-gradient(180deg, #059669, #047857)", borderRadius: "3px" }} />
                    Aktiv version
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#EEF2F7", border: "1px solid #dde3ed", borderRadius: "3px" }} />
                    Inaktiv
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Version comparison table */}
        <div style={card}>
          <div style={cardHeader}>Versions-sammenligning — SARI</div>
          {tableRows.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "13px", color: "#aaa" }}>Ingen versioner endnu.</div>
          ) : (
            <BenchmarkTable versions={tableRows} variant="condensation" />
          )}
        </div>

      </div>
    </div>
  );
}
