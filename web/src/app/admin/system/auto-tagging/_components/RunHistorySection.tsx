import { createAdminClient } from "@/lib/supabase/admin";
import { ManualAutoTagButton } from "./ManualAutoTagButton";

type Run = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  evaluated: number | null;
  scored: number | null;
  skipped: number | null;
  approved: number | null;
};

const sectionCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "24px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "#5a6a85",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function fmtDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function nullStr(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : String(v);
}

const STATUS_ICON: Record<string, string> = {
  completed: "✅",
  failed:    "❌",
  running:   "⏳",
};

export async function RunHistorySection({ job }: { job: "specialty" | "article_type" }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data } = await admin
    .from("auto_tag_logs")
    .select("id, started_at, completed_at, status, evaluated, scored, skipped, approved, errors")
    .eq("job", job)
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  const runs = (data ?? []) as (Run & { errors: unknown })[];
  const total     = runs.length;
  const succeeded = runs.filter(r => r.status === "completed").length;
  const failed    = runs.filter(r => r.status === "failed").length;
  const lastRun   = runs[0] ?? null;
  const isArticleType = job === "article_type";
  const jobLabel = isArticleType ? "auto-tag-article-type" : "auto-tag-specialty";
  const cronLabel = isArticleType ? "nightly 02:30" : "nightly 02:10";
  const hasFailures = failed > 0;
  const statusIcon = total === 0 ? "—" : hasFailures ? "⚠️" : "✅";
  const statusColor = total === 0 ? "#94a3b8" : hasFailures ? "#d97706" : "#15803d";

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <span style={headerLabel}>Run History</span>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Status line */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "18px" }}>{statusIcon}</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: statusColor }}>{jobLabel}</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>runs {cronLabel}</span>
        </div>

        {/* Stats */}
        <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
          Last 14 days:{" "}
          <strong style={{ color: "#1a1a1a" }}>{total}</strong> runs ·{" "}
          <strong style={{ color: "#15803d" }}>{succeeded}</strong> succeeded ·{" "}
          <strong style={{ color: hasFailures ? "#b91c1c" : "#94a3b8" }}>{failed}</strong> failed
        </div>
        {lastRun && (
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "20px" }}>
            Last run: {fmtDateTime(lastRun.started_at)}
            {lastRun.approved !== null && ` · ${lastRun.approved} approved`}
          </div>
        )}
        {!lastRun && (
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "20px" }}>No runs in the last 14 days.</div>
        )}

        {/* Table */}
        {runs.length > 0 && (
          <>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
              Recent runs
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px 6px 0", color: "#94a3b8", fontWeight: 600, minWidth: "140px" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8", fontWeight: 600, width: "60px" }}>Status</th>
                  {isArticleType && <>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Evaluated</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Scored</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Skipped</th>
                  </>}
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Approved</th>
                  <th style={{ textAlign: "right", padding: "6px 0", color: "#94a3b8", fontWeight: 600 }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const durationSec = r.started_at && r.completed_at
                    ? Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid #f8f9fb" }}>
                      <td style={{ padding: "7px 8px 7px 0", color: "#64748b", fontFamily: "monospace", fontSize: "11px" }}>
                        {fmtDateTime(r.started_at)}
                      </td>
                      <td style={{ padding: "7px 8px", fontSize: "13px" }}>
                        {STATUS_ICON[r.status] ?? r.status}
                      </td>
                      {isArticleType && <>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b" }}>{nullStr(r.evaluated)}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b" }}>{nullStr(r.scored)}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b" }}>{nullStr(r.skipped)}</td>
                      </>}
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "#1a1a1a" }}>
                        {nullStr(r.approved)}
                      </td>
                      <td style={{ padding: "7px 0", textAlign: "right", color: "#94a3b8" }}>
                        {fmtDuration(durationSec)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <ManualAutoTagButton job={job === "specialty" ? "specialty" : "article-type"} />
      </div>
    </div>
  );
}
