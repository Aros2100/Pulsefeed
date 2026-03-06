import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import AccuracyChart from "./AccuracyChart";
import PromptSection, { type ModelVersion } from "./PromptSection";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekStart(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function fmt$(n: number): string {
  if (n < 0.001) return `$${(n * 100).toFixed(4)}¢`;
  return `$${n.toFixed(4)}`;
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function last12WeekKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    keys.push(isoWeekKey(d));
  }
  return keys;
}

function shortWeekLabel(key: string): string {
  return key.split("-")[1] ?? key;
}

function pct(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function accuracyColor(v: number | null): string {
  if (v == null) return "#888";
  if (v >= 80) return "#15803d";
  if (v >= 60) return "#d97706";
  return "#dc2626";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user!.id).single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec =
    SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ??
    SPECIALTIES.find((s) => s.active);
  const specialty      = activeSpec?.slug  ?? "neurosurgery";
  const specialtyLabel = activeSpec?.label ?? "Neurosurgery";

  const admin = createAdminClient();

  // Fetch everything in parallel
  const [decisionsRes, queueRes, sessionsRes, versionsRes, weekUsageRes, monthUsageRes, allUsageRes] = await Promise.all([
    admin
      .from("lab_decisions")
      .select("ai_decision, decision, ai_confidence, decided_at, session_id, model_version")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .not("ai_decision", "is", null)
      .order("decided_at", { ascending: true }),
    admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .contains("specialty_tags", [specialty]),
    admin
      .from("lab_sessions")
      .select("id, completed_at, articles_reviewed")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("completed_at", { ascending: false })
      .limit(10),
    admin
      .from("model_versions")
      .select("id, version, prompt_text, notes, activated_at, active, generated_by")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("activated_at", { ascending: false }),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", weekStart()),
    admin.from("api_usage").select("cost_usd").gte("called_at", monthStart()),
    admin.from("api_usage").select("cost_usd"),
  ]);

  if (decisionsRes.error) console.error("[dashboard] lab_decisions query failed:", decisionsRes.error.message);
  if (versionsRes.error)  console.error("[dashboard] model_versions query failed:", versionsRes.error.message);

  const decisions = decisionsRes.data ?? [];
  const queueCount = queueRes.count ?? 0;
  const sessions   = sessionsRes.data ?? [];

  // ── Overall KPIs (scoped to active model version) ───────────────────────────
  const activeVersionName = ((versionsRes.data ?? []).find((v) => v.active)?.version as string | null) ?? null;
  const kpiDecisions   = activeVersionName
    ? decisions.filter((d) => (d.model_version as string | null) === activeVersionName)
    : decisions;

  const total          = kpiDecisions.length;
  const correct        = kpiDecisions.filter((d) => d.ai_decision === d.decision).length;
  const accuracy       = pct(correct, total);
  const falsePositives = kpiDecisions.filter((d) => d.ai_decision === "approved" && d.decision === "rejected").length;
  const falseNegatives = kpiDecisions.filter((d) => d.ai_decision === "rejected" && d.decision === "approved").length;

  // ── Weekly chart (last 12 weeks) ────────────────────────────────────────────
  const weekMap: Record<string, { total: number; correct: number }> = {};
  for (const d of decisions) {
    const key = isoWeekKey(new Date(d.decided_at as string));
    if (!weekMap[key]) weekMap[key] = { total: 0, correct: 0 };
    weekMap[key].total++;
    if (d.ai_decision === d.decision) weekMap[key].correct++;
  }
  const weeklyData = last12WeekKeys().map((key) => ({
    label:    shortWeekLabel(key),
    accuracy: weekMap[key] ? pct(weekMap[key].correct, weekMap[key].total) : null,
    total:    weekMap[key]?.total ?? 0,
  }));

  // ── Confidence calibration ───────────────────────────────────────────────────
  const bands = [
    { label: "90–100%", min: 90, max: 100 },
    { label: "70–89%",  min: 70, max: 89  },
    { label: "50–69%",  min: 50, max: 69  },
    { label: "<50%",    min: 0,  max: 49  },
  ];
  const calibration = bands.map(({ label, min, max }) => {
    const inBand  = decisions.filter((d) => {
      const c = d.ai_confidence as number | null;
      return c != null && c >= min && c <= max;
    });
    const ok = inBand.filter((d) => d.ai_decision === d.decision).length;
    return { label, validated: inBand.length, correct: ok, accuracy: pct(ok, inBand.length) };
  });

  // ── Recent sessions ─────────────────────────────────────────────────────────
  const sessionIds = sessions.map((s) => s.id as string);
  let sessionDecisions: { session_id: string; ai_decision: string; decision: string }[] = [];
  if (sessionIds.length > 0) {
    const { data } = await admin
      .from("lab_decisions")
      .select("session_id, ai_decision, decision")
      .in("session_id", sessionIds)
      .not("ai_decision", "is", null);
    sessionDecisions = (data ?? []) as typeof sessionDecisions;
  }

  const sessionAccuracy = (id: string): number | null => {
    const ds = sessionDecisions.filter((d) => d.session_id === id);
    if (ds.length === 0) return null;
    return pct(ds.filter((d) => d.ai_decision === d.decision).length, ds.length);
  };

  const recentSessions = sessions.map((s, i) => {
    const acc      = sessionAccuracy(s.id as string);
    const prevAcc  = i < sessions.length - 1 ? sessionAccuracy(sessions[i + 1].id as string) : null;
    const trend    = acc == null || prevAcc == null ? "—"
                   : acc > prevAcc ? "↑" : acc < prevAcc ? "↓" : "→";
    const trendClr = trend === "↑" ? "#15803d" : trend === "↓" ? "#dc2626" : "#888";
    return { ...s, acc, trend, trendClr };
  });

  // ── Per-version accuracy (grouped by model_version on lab_decisions) ─────────
  const versionAccMap: Record<string, { total: number; correct: number }> = {};
  for (const d of decisions) {
    const mv = d.model_version as string | null;
    if (!mv) continue;
    if (!versionAccMap[mv]) versionAccMap[mv] = { total: 0, correct: 0 };
    versionAccMap[mv].total++;
    if (d.ai_decision === d.decision) versionAccMap[mv].correct++;
  }

  // Versions are ordered DESC; versions[i].deactivated_at = versions[i-1].activated_at
  const rawVersions = versionsRes.data ?? [];
  const versions: ModelVersion[] = rawVersions.map((v, i) => {
    const stats = versionAccMap[v.version as string] ?? { total: 0, correct: 0 };
    return {
      id:             v.id as string,
      version:        v.version as string,
      prompt:         v.prompt_text as string,
      notes:          v.notes as string | null,
      activated_at:   v.activated_at as string,
      deactivated_at: i === 0 ? null : (rawVersions[i - 1].activated_at as string),
      active:         v.active as boolean,
      accuracy:       pct(stats.correct, stats.total),
      validatedCount: stats.total,
      generated_by:   (v.generated_by as string | null) ?? "manual",
    };
  });

  // ── AI usage ────────────────────────────────────────────────────────────────
  const costThisWeek  = (weekUsageRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const costThisMonth = (monthUsageRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const costAllTime   = (allUsageRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const daysElapsed   = Math.max(1, new Date().getUTCDate());
  const daysInMonth   = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate();
  const estMonthly    = (costThisMonth / daysElapsed) * daysInMonth;
  const byModel: Record<string, { tokens: number; cost: number }> = {};
  for (const row of weekUsageRes.data ?? []) {
    const k = row.model_key as string;
    if (!byModel[k]) byModel[k] = { tokens: 0, cost: 0 };
    byModel[k].tokens += (row.total_tokens as number) ?? 0;
    byModel[k].cost   += Number(row.cost_usd ?? 0);
  }
  const modelEntries = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  const hasUsage = costAllTime > 0;

  // ── Shared card style ────────────────────────────────────────────────────────
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
    color: "#E83B2A",
    textTransform: "uppercase",
    fontWeight: 700,
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <Link href="/admin/lab" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>
            ← The Lab
          </Link>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginTop: "16px", marginBottom: "6px" }}>
            Performance
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Specialty Tag Validation · {specialtyLabel}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Hvor godt rammer AI&apos;en sammenlignet med din vurdering?
          </p>
        </div>

        {/* 1 ── Overall KPI cards (scoped to active version) */}
        {activeVersionName && (
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
            Nøjagtighed for <span style={{ fontWeight: 700, color: "#5a6a85" }}>{activeVersionName}</span> (aktiv)
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "16px" }}>
          {[
            { label: "Valideret i alt",   value: total,          sub: null },
            { label: "AI-nøjagtighed",    value: accuracy != null ? `${accuracy}%` : "—", sub: null, highlight: accuracy },
            { label: "False positives",   value: falsePositives, sub: "AI godkendt → afvist" },
            { label: "False negatives",   value: falseNegatives, sub: "AI afvist → godkendt" },
            { label: "Artikler i kø",     value: queueCount,     sub: null },
          ].map(({ label, value, sub, highlight }) => (
            <div key={label} style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "16px 18px" }}>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: highlight != null ? accuracyColor(highlight) : "#1a1a1a" }}>{value}</div>
              {sub && <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* 2 ── Weekly accuracy chart */}
        <div style={card}>
          <div style={cardHeader}>Ugentlig nøjagtighed · seneste 12 uger</div>
          <div style={{ padding: "20px 24px" }}>
            <AccuracyChart data={weeklyData} />
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "8px" }}>
              Stiplet linje = 80% målsætning
            </div>
          </div>
        </div>

        {/* 3 ── Confidence calibration table */}
        <div style={card}>
          <div style={cardHeader}>Confidence kalibrering</div>
          <div style={{ padding: "0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f2f5" }}>
                  {["Confidence", "Valideret", "AI korrekt", "Nøjagtighed"].map((h) => (
                    <th key={h} style={{ padding: "10px 24px", textAlign: "left", fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calibration.map((row) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f9f9f9" }}>
                    <td style={{ padding: "12px 24px", fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: "12px 24px", color: "#5a6a85" }}>{row.validated}</td>
                    <td style={{ padding: "12px 24px", color: "#5a6a85" }}>{row.correct}</td>
                    <td style={{ padding: "12px 24px" }}>
                      {row.accuracy != null ? (
                        <span style={{ fontWeight: 700, color: accuracyColor(row.accuracy) }}>
                          {row.accuracy}%
                        </span>
                      ) : (
                        <span style={{ color: "#aaa" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4 ── Recent sessions */}
        <div style={card}>
          <div style={cardHeader}>Seneste sessioner</div>
          {recentSessions.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "13px", color: "#aaa" }}>Ingen sessioner endnu.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f2f5" }}>
                  {["Dato", "Artikler", "Nøjagtighed", "Trend"].map((h) => (
                    <th key={h} style={{ padding: "10px 24px", textAlign: "left", fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s.id as string} style={{ borderBottom: "1px solid #f9f9f9" }}>
                    <td style={{ padding: "12px 24px", color: "#5a6a85" }}>{fmtDate(s.completed_at as string | null)}</td>
                    <td style={{ padding: "12px 24px" }}>{s.articles_reviewed as number}</td>
                    <td style={{ padding: "12px 24px" }}>
                      {s.acc != null ? (
                        <span style={{ fontWeight: 700, color: accuracyColor(s.acc) }}>{s.acc}%</span>
                      ) : (
                        <span style={{ color: "#aaa" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 24px", fontWeight: 700, color: s.trendClr, fontSize: "16px" }}>
                      {s.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 5 ── Prompt version history */}
        <PromptSection
          versions={versions}
          specialty={specialty}
          module="specialty_tag"
          totalDisagreements={falsePositives + falseNegatives}
        />

        {/* 6 ── AI usage */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginTop: "32px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700 }}>
              Claude API
            </span>
            <span style={{ fontSize: "11px", color: "#888" }}>All time: {fmt$(costAllTime)}</span>
          </div>

          <div style={{ padding: "20px 24px" }}>
            {!hasUsage ? (
              <div style={{ fontSize: "13px", color: "#aaa" }}>No API calls recorded yet.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>This week</div>
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt$(costThisWeek)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>This month</div>
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt$(costThisMonth)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Est. this month</div>
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt$(estMonthly)}</div>
                  </div>
                </div>

                {modelEntries.length > 0 && (
                  <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                      This week by model
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {modelEntries.map(([key, v]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "#5a6a85", fontFamily: "monospace" }}>{key}</span>
                          <div style={{ display: "flex", gap: "20px" }}>
                            <span style={{ color: "#888" }}>{v.tokens.toLocaleString()} tok</span>
                            <span style={{ fontWeight: 600 }}>{fmt$(v.cost)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
