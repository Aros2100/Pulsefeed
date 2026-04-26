import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartRunModal } from "./_components/StartRunModal";

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "28px",
};

const cardHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em",
  textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "11px 16px", fontSize: "13px", color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunSummary {
  run_id: string;
  run_name: string;
  run_notes: string | null;
  run_started_at: string;
  total: number;
  with_country: number;
  with_city: number;
  high_conf: number;
  errors: number;
  mean_ms: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function pct(n: number, total: number) {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ParserDiagnosticsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: raw } = await admin
    .from("geo_fase0_parser_runs")
    .select("run_id, run_name, run_notes, run_started_at, parsed_country, parsed_city, parsed_confidence, parse_error, parse_duration_ms")
    .order("run_started_at", { ascending: false })
    .limit(20000);

  const rows = (raw ?? []) as {
    run_id: string;
    run_name: string;
    run_notes: string | null;
    run_started_at: string;
    parsed_country: string | null;
    parsed_city: string | null;
    parsed_confidence: string | null;
    parse_error: string | null;
    parse_duration_ms: number | null;
  }[];

  // Aggregate per run_id
  const runMap = new Map<string, RunSummary>();
  for (const row of rows) {
    if (!runMap.has(row.run_id)) {
      runMap.set(row.run_id, {
        run_id: row.run_id,
        run_name: row.run_name,
        run_notes: row.run_notes,
        run_started_at: row.run_started_at,
        total: 0,
        with_country: 0,
        with_city: 0,
        high_conf: 0,
        errors: 0,
        mean_ms: 0,
      });
    }
    const s = runMap.get(row.run_id)!;
    s.total++;
    if (row.parsed_country) s.with_country++;
    if (row.parsed_city) s.with_city++;
    if (row.parsed_confidence === "high") s.high_conf++;
    if (row.parse_error) s.errors++;
    s.mean_ms += row.parse_duration_ms ?? 0;
  }

  const runs = Array.from(runMap.values()).map((s) => ({
    ...s,
    mean_ms: s.total > 0 ? Math.round((s.mean_ms / s.total) * 10) / 10 : 0,
  }));

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading + action */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "36px", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              System · Geo
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Parser Diagnostics</h1>
            <p style={{ fontSize: "13px", color: "#5a6a85", margin: 0 }}>
              Run the affiliation parser on the 1,000-article fase-0 sample. Use this to measure parser improvements before/after code changes.
            </p>
          </div>
          <div style={{ flexShrink: 0, paddingTop: "4px" }}>
            <StartRunModal />
          </div>
        </div>

        {/* Run list */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={headerLabel}>Runs</span>
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
          </div>

          {runs.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>
              No runs yet. Click &quot;Start new run&quot; to begin.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Run name", "Notes", "Started", "Total", "With country", "With city", "High conf.", "Errors", "Mean ms", ""].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.run_id} style={{ background: "#fff" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{run.run_name}</td>
                      <td style={{ ...tdStyle, color: "#5a6a85", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {run.run_notes ?? <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(run.run_started_at)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{run.total}</td>
                      <td style={{ ...tdStyle }}>
                        {run.with_country}
                        <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>({pct(run.with_country, run.total)})</span>
                      </td>
                      <td style={{ ...tdStyle }}>
                        {run.with_city}
                        <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>({pct(run.with_city, run.total)})</span>
                      </td>
                      <td style={{ ...tdStyle }}>
                        {run.high_conf}
                        <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>({pct(run.high_conf, run.total)})</span>
                      </td>
                      <td style={{ ...tdStyle, color: run.errors > 0 ? "#dc2626" : "#9ca3af" }}>{run.errors}</td>
                      <td style={{ ...tdStyle, color: "#5a6a85" }}>{run.mean_ms}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link
                          href={`/admin/parser-diagnostics/${run.run_id}`}
                          style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
