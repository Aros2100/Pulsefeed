import { createAdminClient } from "@/lib/supabase/admin";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CircleLog {
  status:            string;
  started_at:        string | null;
  errors:            string[] | null;
}

interface AuthorLog {
  status:       string;
  started_at:   string | null;
  errors:       { articleId: string; error: string }[] | null;
}

interface SyncRun {
  run_time: string;
}

type JobStatus = "ok" | "failed" | "stale";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const STALE_HOURS = 26;

function isStale(ts: string | null): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_HOURS * 60 * 60 * 1000;
}

function jobStatus(log: { status: string; started_at: string | null } | null): JobStatus {
  if (!log) return "stale";
  if (log.status === "failed") return "failed";
  if (isStale(log.started_at)) return "stale";
  return "ok";
}

function syncJobStatus(runTime: string | null): JobStatus {
  if (!runTime) return "stale";
  if (isStale(runTime)) return "stale";
  return "ok";
}

function statusIcon(s: JobStatus) {
  if (s === "ok")     return { icon: "✅", color: "#166534" };
  if (s === "failed") return { icon: "❌", color: "#991b1b" };
  return                     { icon: "⚠️", color: "#92400e" };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function firstError(errors: unknown): string | null {
  if (!errors || !Array.isArray(errors) || errors.length === 0) return null;
  const e = errors[0];
  const msg = typeof e === "string" ? e : (e as { error?: string })?.error ?? JSON.stringify(e);
  return msg.length > 60 ? msg.slice(0, 57) + "…" : msg;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default async function NightlyReport() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const [c1Res, c4Res, c2Res, authorRes, syncRes] = await Promise.all([
    admin.from("import_logs").select("status, started_at, errors")
      .eq("circle", 1).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("import_logs").select("status, started_at, errors")
      .eq("circle", 4).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("import_logs").select("status, started_at, errors")
      .eq("circle", 2).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    a.from("author_update_logs").select("status, started_at, errors")
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    a.rpc("pubmed_sync_log_runs"),
  ]);

  const c1     = c1Res.data     as CircleLog | null;
  const c4     = c4Res.data     as CircleLog | null;
  const c2     = c2Res.data     as CircleLog | null;
  const author = authorRes.data as AuthorLog  | null;
  const syncs  = (syncRes.data ?? []) as SyncRun[];
  const sync   = syncs[0] ?? null;
  const syncTs = sync?.run_time ? sync.run_time + ":00Z" : null;

  const rows: { label: string; ts: string | null; status: JobStatus; error: string | null }[] = [
    { label: "C1 Import",    ts: c1?.started_at ?? null,   status: jobStatus(c1),           error: firstError(c1?.errors) },
    { label: "C4 Import",    ts: c4?.started_at ?? null,   status: jobStatus(c4),           error: firstError(c4?.errors) },
    { label: "C2 Import",    ts: c2?.started_at ?? null,   status: jobStatus(c2),           error: firstError(c2?.errors) },
    { label: "PubMed Sync",  ts: syncTs,                   status: syncJobStatus(syncTs),   error: null },
    { label: "Author Update",ts: author?.started_at ?? null, status: jobStatus(author),     error: firstError(author?.errors) },
  ];

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
  };

  const thStyle: React.CSSProperties = {
    padding: "9px 16px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#5a6a85",
    borderBottom: "1px solid #eef0f4",
    background: "#f8f9fb",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 16px",
    fontSize: "13px",
    color: "#1a1a1a",
    borderBottom: "1px solid #f1f3f7",
    verticalAlign: "middle" as const,
  };

  return (
    <div style={cardStyle}>
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
          Nightly report
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Job", "Status", "Time"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { icon, color } = statusIcon(row.status);
            return (
              <tr key={row.label}>
                <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: "nowrap" as const }}>{row.label}</td>
                <td style={{ ...tdStyle }}>
                  <span style={{ color, fontWeight: 700 }}>{icon}</span>
                  {row.status === "failed" && row.error && (
                    <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "3px" }}>{row.error}</div>
                  )}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" as const, color: "#5a6a85" }}>{fmt(row.ts)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
