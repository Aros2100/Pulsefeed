import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function errorCount(errors: unknown): number {
  if (!errors) return 0;
  if (Array.isArray(errors)) return errors.length;
  if (typeof errors === "object") return Object.keys(errors as object).length;
  return 0;
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#5a6a85",
  borderBottom: "1px solid #eef0f4",
  background: "#f8f9fb",
  whiteSpace: "nowrap",
};

function tdStyle(failed: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    fontSize: "13px",
    color: failed ? "#b91c1c" : "#1a1a1a",
    borderBottom: "1px solid #f1f3f7",
    background: failed ? "#fef2f2" : "#fff",
  };
}

export default async function SpecialtyImportPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty } = await params;
  const spec = SPECIALTIES.find((s) => s.slug === specialty);
  if (!spec) notFound();

  const admin = createAdminClient();

  // Get filter IDs for this specialty to filter logs
  const { data: filters } = await admin
    .from("pubmed_filters")
    .select("id")
    .eq("specialty", specialty);

  const filterIds = (filters ?? []).map((f) => f.id as string);

  // Fetch last 20 import logs for this specialty
  let logsQuery = admin
    .from("import_logs")
    .select("*, pubmed_filters(name, specialty)")
    .order("started_at", { ascending: false })
    .limit(20);

  if (filterIds.length > 0) {
    logsQuery = logsQuery.or(`filter_id.is.null,filter_id.in.(${filterIds.join(",")})`);
  } else {
    logsQuery = logsQuery.is("filter_id", null);
  }

  const { data: logs } = await logsQuery;

  // Summary stats — single query with conditional aggregation
  const { data: articleRows } = await admin
    .from("articles")
    .select("circle")
    .contains("specialty_tags", [specialty]);

  const rows = articleRows ?? [];
  const circle1Count = rows.filter((r) => r.circle === 1).length;
  const circle2Count = rows.filter((r) => r.circle === 2).length;
  const circle3Count = rows.filter((r) => r.circle === 3).length;
  const totalCount = rows.length;

  const lastImportAt = logs?.find((l) => l.status === "completed")?.completed_at ?? null;

  const importLogs = logs ?? [];

  // Accumulated total per row (newest → oldest).
  // Baseline is the actual DB total; each older row subtracts the imported count of the rows above it.
  let runningTotal = totalCount;
  const accumulatedByIndex = importLogs.map((log) => {
    const acc = runningTotal;
    runningTotal -= (log.articles_imported ?? 0);
    return acc;
  });

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <Header />
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/system/import" style={{ color: "#5a6a85", textDecoration: "none" }}>← Import</Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            System · Import · {spec.label}
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>
            Import history · {spec.label}
          </h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Last 20 import runs for this specialty
          </p>
        </div>

        {/* Summary stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
          marginBottom: "28px",
        }}>
          {[
            { label: "Total articles", value: totalCount },
            { label: "Circle 1 · Verified", value: circle1Count },
            { label: "Circle 2 · Pending", value: circle2Count },
            { label: "Circle 3 · Rejected", value: circle3Count, red: circle3Count > 0 },
            { label: "Last import", value: fmt(lastImportAt), small: true },
          ].map(({ label, value, small, red }) => (
            <div key={label} style={{
              background: "#fff",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
              padding: "16px 20px",
            }}>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                {label}
              </div>
              <div style={{ fontSize: small ? "14px" : "22px", fontWeight: 700, color: red ? "#b91c1c" : "#1a1a1a", lineHeight: 1.3 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Import runs table */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{
            background: "#EEF2F7",
            borderBottom: "1px solid #dde3ed",
            padding: "10px 24px",
          }}>
            <span style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "#E83B2A",
              textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Import runs
            </span>
          </div>

          {importLogs.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              No import runs yet for {spec.label}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Started</th>
                    <th style={thStyle}>Trigger</th>
                    <th style={thStyle}>Filter</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Fetched</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Imported</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Akkumuleret</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Skipped</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Errors</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Balance</th>
                    <th style={thStyle}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {importLogs.map((log, i) => {
                    const failed = log.status === "failed";
                    const errCount = errorCount(log.errors);
                    const fetched = log.articles_fetched ?? 0;
                    const imported = log.articles_imported ?? 0;
                    const skipped = log.articles_skipped ?? 0;
                    const trigger = (log.trigger as string | null) ?? "—";
                    const balanceOk = fetched > 0 && fetched === imported + skipped + errCount;
                    const td = tdStyle(failed);

                    return (
                      <tr key={log.id}>
                        <td style={{ ...td, whiteSpace: "nowrap", color: failed ? "#b91c1c" : "#5a6a85" }}>
                          {fmt(log.started_at)}
                        </td>
                        <td style={td}>
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            padding: "2px 6px",
                            background: trigger === "cron" ? "#f0f4ff" : "#f5f0ff",
                            color: trigger === "cron" ? "#3730a3" : "#6b21a8",
                          }}>
                            {trigger}
                          </span>
                        </td>
                        <td style={{ ...td, color: failed ? "#b91c1c" : "#5a6a85", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(log.pubmed_filters as { name: string } | null)?.name ?? (
                            <span style={{ color: "#bbb" }}>All filters</span>
                          )}
                        </td>
                        <td style={td}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            borderRadius: "999px",
                            padding: "2px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            ...(log.status === "completed"
                              ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }
                              : log.status === "failed"
                              ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
                              : { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }),
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: failed ? "#b91c1c" : "#1a1a1a" }}>
                          {fetched}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: failed ? "#b91c1c" : "#15803d" }}>
                          {imported}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#1a1a1a" }}>
                          {accumulatedByIndex[i]}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: failed ? "#b91c1c" : "#888" }}>
                          {skipped}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: errCount > 0 ? "#b91c1c" : "#bbb" }}>
                          {errCount > 0 ? errCount : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontSize: "15px" }}>
                          {log.status === "completed" ? (
                            <span title={balanceOk ? "No errors" : `${errCount} error(s)`} style={{ color: balanceOk ? "#15803d" : "#b91c1c" }}>
                              {balanceOk ? "✓" : "✗"}
                            </span>
                          ) : (
                            <span style={{ color: "#bbb" }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, color: failed ? "#b91c1c" : "#888", fontVariantNumeric: "tabular-nums" }}>
                          {duration(log.started_at, log.completed_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
