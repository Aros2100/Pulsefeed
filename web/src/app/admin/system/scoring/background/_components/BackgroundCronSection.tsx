import { ManualTriggerButton } from "./ManualTriggerButton";

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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}

type RunStats = {
  total_runs: number;
  succeeded: number;
  failed: number;
  last_run: string | null;
};

type BatchRow = {
  id: string;
  module: string;
  anthropic_batch_id: string | null;
  article_count: number | null;
  timestamp: string | null; // ended_at or ingested_at
};

export function BackgroundCronSection({
  id,
  job,
  title,
  jobname,
  tableHeading,
  timeLabel,
  stats,
  batches,
}: {
  id: string;
  job: "poll" | "ingest";
  title: string;
  jobname: string;
  tableHeading: string;
  timeLabel: string;
  stats: RunStats | null;
  batches: BatchRow[];
}) {
  const hasFailures = stats && stats.failed > 0;
  const statusIcon = !stats ? "—" : hasFailures ? "⚠️" : "✅";
  const statusColor = !stats ? "#94a3b8" : hasFailures ? "#d97706" : "#15803d";

  return (
    <div id={id} style={sectionCard}>
      <div style={sectionHeader}>
        <span style={headerLabel}>{title}</span>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Status line */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "18px" }}>{statusIcon}</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: statusColor }}>
            {jobname}
          </span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>runs every 5 min</span>
        </div>

        {/* Stats */}
        {stats ? (
          <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
            Last 24h: <strong style={{ color: "#1a1a1a" }}>{stats.total_runs}</strong> runs ·{" "}
            <strong style={{ color: "#15803d" }}>{stats.succeeded}</strong> succeeded ·{" "}
            <strong style={{ color: hasFailures ? "#b91c1c" : "#94a3b8" }}>{stats.failed}</strong> failed
          </div>
        ) : (
          <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>No runs in the last 24h</div>
        )}
        {stats?.last_run && (
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "20px" }}>
            Last run: {fmtDateTime(stats.last_run)}
          </div>
        )}

        {/* Table */}
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
          {tableHeading}
        </div>
        {batches.length === 0 ? (
          <div style={{ fontSize: "13px", color: "#94a3b8", padding: "12px 0" }}>No entries in the last 24h.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f2f5" }}>
                <th style={{ textAlign: "left", padding: "6px 8px 6px 0", color: "#94a3b8", fontWeight: 600, width: "70px" }}>{timeLabel}</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Module</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8", fontWeight: 600 }}>Articles</th>
                <th style={{ textAlign: "left", padding: "6px 0", color: "#94a3b8", fontWeight: 600 }}>Batch ID</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} style={{ borderBottom: "0.5px solid #f8f9fb" }}>
                  <td style={{ padding: "7px 8px 7px 0", color: "#64748b", fontFamily: "monospace", fontSize: "11px" }}>
                    {fmtTime(b.timestamp)}
                  </td>
                  <td style={{ padding: "7px 8px", color: "#1a1a1a", fontWeight: 500 }}>
                    {b.module}
                  </td>
                  <td style={{ padding: "7px 8px", color: "#64748b" }}>
                    {b.article_count ?? "—"}
                  </td>
                  <td style={{ padding: "7px 0", color: "#94a3b8", fontFamily: "monospace", fontSize: "11px" }}>
                    {b.anthropic_batch_id?.slice(0, 12) ?? b.id.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <ManualTriggerButton job={job} />
      </div>
    </div>
  );
}
