import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
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

function n(v: number) {
  return v.toLocaleString("da-DK");
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

const cardHeader = (accent = false): React.CSSProperties => ({
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: accent ? "#E83B2A" : "#5a6a85",
});

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

// ── Page ──────────────────────────────────────────────────────────────────────

type StatRow = { circle: number | null; status: string | null; antal: number };

export default async function SpecialtyImportPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty } = await params;
  const spec = SPECIALTIES.find((s) => s.slug === specialty);
  if (!spec) notFound();

  const admin = createAdminClient();

  // ── Stats via RPC ──────────────────────────────────────────────────────────
  const { data: statsRows } = await admin.rpc(
    "get_specialty_article_stats" as never,
    { specialty_slug: specialty } as never
  );
  const stats = (statsRows as unknown as StatRow[]) ?? [];

  function get(c: number, s: string) {
    return Number(stats.find((r) => r.circle === c && r.status === s)?.antal ?? 0);
  }

  const c1Approved  = get(1, "approved");
  const c2Approved  = get(2, "approved");
  const c2Pending   = get(2, "pending");
  // circle=3 are old-code rejections (before circle was frozen at import).
  // Fold them into the rejected count so they show up correctly.
  const c2Rejected  = get(2, "rejected") + get(3, "rejected");
  const c2Total     = c2Approved + c2Pending + c2Rejected;
  const c1Total     = stats.filter((r) => r.circle === 1).reduce((s, r) => s + Number(r.antal), 0);
  const c3Total     = stats.filter((r) => r.circle === 3).reduce((s, r) => s + Number(r.antal), 0);
  const totalInDB   = stats.reduce((s, r) => s + Number(r.antal), 0);
  const tilgaengelige = c1Approved + c2Approved;

  // Balance checks
  const balanceAll  = c1Total + c2Total + c3Total === totalInDB;
  const balanceTilg = tilgaengelige === c1Approved + c2Approved; // always definitionally true

  // ── Import logs ────────────────────────────────────────────────────────────
  const { data: filters } = await admin
    .from("pubmed_filters")
    .select("id")
    .eq("specialty", specialty);
  const filterIds = (filters ?? []).map((f) => f.id as string);

  let logsQuery = admin
    .from("import_logs")
    .select("*, pubmed_filters(name)")
    .order("started_at", { ascending: false })
    .limit(20);

  if (filterIds.length > 0) {
    logsQuery = logsQuery.or(`filter_id.is.null,filter_id.in.(${filterIds.join(",")})`);
  } else {
    logsQuery = logsQuery.is("filter_id", null);
  }

  const { data: logs } = await logsQuery;
  const importLogs = logs ?? [];

  // Accumulated: newest row = totalInDB (all circles), each older row -= previous imported
  const baseTotal = totalInDB;
  let running = baseTotal;
  const accumulated = importLogs.map((log) => {
    const acc = running;
    running -= log.articles_imported ?? 0;
    return acc;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Import · {spec.label}
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>
            Import overview · {spec.label}
          </h1>
        </div>

        {/* ── Hero: Tilgængelige ──────────────────────────────────────────── */}
        <div style={{
          ...card,
          marginBottom: "16px",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px",
            }}>
              Tilgængelige for brugerne
            </div>
            <div style={{ fontSize: "52px", fontWeight: 800, lineHeight: 1, color: "#E83B2A" }}>
              {n(tilgaengelige)}
            </div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>
              Circle 1 godkendt ({n(c1Approved)}) + Circle 2 godkendt ({n(c2Approved)})
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "#bbb", textAlign: "right" }}>
            <div>Total i DB: {n(totalInDB)}</div>
          </div>
        </div>

        {/* ── Circle 1 + Circle 2 cards ───────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

          {/* Circle 1 */}
          <div style={card}>
            <div style={cardHeader(true)}>Circle 1 — Auto-verificeret</div>
            <div style={{ padding: "20px" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr",
                gap: "12px",
              }}>
                <div style={{ background: "#f0fdf4", borderRadius: "8px", padding: "14px 16px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "11px", color: "#15803d", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "4px" }}>
                    Approved
                  </div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#15803d" }}>{n(c1Approved)}</div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>circle = 1 · status = approved</div>
                </div>
                {c1Total !== c1Approved && (
                  <div style={{ background: "#fef2f2", borderRadius: "8px", padding: "10px 16px", border: "1px solid #fecaca" }}>
                    <div style={{ fontSize: "12px", color: "#b91c1c" }}>
                      ⚠ {n(c1Total - c1Approved)} artikel(er) i circle 1 uden status = approved
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Circle 2 */}
          <div style={card}>
            <div style={cardHeader(true)}>Circle 2 — Til validering</div>
            <div style={{ padding: "20px" }}>
              {/* Total */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "16px" }}>
                <div style={{ fontSize: "32px", fontWeight: 800, color: "#1a1a1a" }}>{n(c2Total)}</div>
                <div style={{ fontSize: "13px", color: "#888" }}>artikler i alt</div>
              </div>
              {/* Sub-breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {[
                  { label: "Approved",  value: c2Approved, bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" },
                  { label: "Afventer",  value: c2Pending,  bg: "#fffbeb", border: "#fde68a", color: "#d97706" },
                  { label: "Afvist",    value: c2Rejected, bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
                ].map(({ label, value, bg, border, color }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "8px", padding: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color, marginBottom: "4px" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color }}>{n(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Balance checks ──────────────────────────────────────────────── */}
        <div style={{
          ...card,
          padding: "14px 20px",
          marginBottom: "32px",
        }}>
          <div style={{ display: "flex", gap: "32px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, flexShrink: 0 }}>
              Balance
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                {
                  ok: balanceAll,
                  label: `Circle 1 (${n(c1Total)}) + Circle 2 (${n(c2Total)}) = Total i DB (${n(totalInDB)})`,
                  diff: totalInDB - c1Total - c2Total,
                },
                {
                  ok: balanceTilg,
                  label: `Tilgængelige (${n(tilgaengelige)}) = C1 approved (${n(c1Approved)}) + C2 approved (${n(c2Approved)})`,
                  diff: 0,
                },
              ].map(({ ok, label, diff }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: ok ? "#15803d" : "#b91c1c", flexShrink: 0 }}>
                    {ok ? "✓" : "✗"}
                  </span>
                  <span style={{ color: "#5a6a85" }}>{label}</span>
                  {!ok && diff !== 0 && (
                    <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                      (diff: {diff > 0 ? "+" : ""}{diff})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Import log table ────────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardHeader(true)}>Import runs · seneste 20</div>

          {importLogs.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Ingen import runs endnu for {spec.label}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Dato</th>
                    <th style={thStyle}>Filter</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Hentet</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Importeret</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Skippet</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Fejl</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Akkumuleret</th>
                    <th style={thStyle}>Varighed</th>
                  </tr>
                </thead>
                <tbody>
                  {importLogs.map((log, i) => {
                    const failed  = log.status === "failed";
                    const errCnt  = errorCount(log.errors);
                    const fetched = log.articles_fetched  ?? 0;
                    const imported = log.articles_imported ?? 0;
                    const skipped  = log.articles_skipped  ?? 0;
                    const trigger  = (log.trigger as string | null) ?? null;
                    const td = tdStyle(failed);

                    return (
                      <tr key={log.id}>
                        {/* Dato */}
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <div style={{ color: failed ? "#b91c1c" : "#5a6a85", fontSize: "12px" }}>
                            {fmt(log.started_at)}
                          </div>
                          <div style={{ marginTop: "2px", display: "flex", gap: "4px", alignItems: "center" }}>
                            <span style={{
                              fontSize: "10px", fontWeight: 600, borderRadius: "3px", padding: "1px 5px",
                              background: log.status === "completed" ? "#f0fdf4" : log.status === "failed" ? "#fef2f2" : "#eff6ff",
                              color: log.status === "completed" ? "#15803d" : log.status === "failed" ? "#b91c1c" : "#1d4ed8",
                              border: `1px solid ${log.status === "completed" ? "#bbf7d0" : log.status === "failed" ? "#fecaca" : "#bfdbfe"}`,
                            }}>
                              {log.status}
                            </span>
                            {trigger && (
                              <span style={{
                                fontSize: "10px", fontWeight: 600, borderRadius: "3px", padding: "1px 5px",
                                background: trigger === "cron" ? "#f0f4ff" : "#f5f0ff",
                                color: trigger === "cron" ? "#3730a3" : "#6b21a8",
                              }}>
                                {trigger}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Filter */}
                        <td style={{ ...td, color: "#5a6a85", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(log.pubmed_filters as { name: string } | null)?.name ?? (
                            <span style={{ color: "#bbb" }}>All filters</span>
                          )}
                        </td>

                        {/* Hentet */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fetched > 0 ? n(fetched) : <span style={{ color: "#bbb" }}>—</span>}
                        </td>

                        {/* Importeret */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: failed ? "#b91c1c" : "#15803d" }}>
                          {imported > 0 ? n(imported) : <span style={{ color: "#bbb", fontWeight: 400 }}>—</span>}
                        </td>

                        {/* Skippet */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#888" }}>
                          {skipped > 0 ? n(skipped) : <span style={{ color: "#bbb" }}>—</span>}
                        </td>

                        {/* Fejl */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: errCnt > 0 ? "#b91c1c" : "#bbb" }}>
                          {errCnt > 0 ? errCnt : "—"}
                        </td>

                        {/* Akkumuleret */}
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                          {n(accumulated[i])}
                        </td>

                        {/* Varighed */}
                        <td style={{ ...td, color: "#888", fontVariantNumeric: "tabular-nums" }}>
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
