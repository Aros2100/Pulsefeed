"use client";

import { useState, useMemo, useEffect } from "react";

// ── Trace types ───────────────────────────────────────────────────────────────

interface TraceResult {
  country: string | null;
  city: string | null;
  institution: string | null;
  department: string | null;
  confidence: "high" | "low";
}

interface TraceResponse {
  input: string;
  result: TraceResult | null;
  trace: string[];
  duration_ms: number;
  error?: string;
}

type TraceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: TraceResponse }
  | { status: "error"; message: string };

export interface RunRow {
  id: string;
  pubmed_id: string;
  input_string: string;
  parsed_country: string | null;
  parsed_city: string | null;
  parsed_state: string | null;
  parsed_institution: string | null;
  parsed_department: string | null;
  parsed_confidence: string | null;
  parse_duration_ms: number | null;
  parse_error: string | null;
}

interface Props {
  rows: RunRow[];
}

const PAGE_SIZE = 50;

const SELECT_STYLE: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "13px",
  fontFamily: "inherit",
  background: "#fff",
  color: "#374151",
  outline: "none",
  cursor: "pointer",
};

const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "#374151",
  minWidth: "200px",
};

const thStyle: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: "12px", color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7", verticalAlign: "top",
};

function ConfBadge({ v }: { v: string | null }) {
  if (!v) return <span style={{ color: "#9ca3af" }}>—</span>;
  const color = v === "high" ? "#15803d" : "#c2410c";
  const bg = v === "high" ? "#f0fdf4" : "#fff7ed";
  const border = v === "high" ? "#bbf7d0" : "#fed7aa";
  return (
    <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: bg, color, border: `1px solid ${border}` }}>
      {v}
    </span>
  );
}

function trunc(s: string | null, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

function p95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

export function RunDetailClient({ rows }: Props) {
  const [filterCountry, setFilterCountry] = useState<string>("__all__");
  const [filterConf, setFilterConf] = useState<string>("__all__");
  const [filterError, setFilterError] = useState<string>("__all__");
  const [filterHasCountry, setFilterHasCountry] = useState<string>("__all__");
  const [filterHasCity, setFilterHasCity] = useState<string>("__all__");
  const [filterQ, setFilterQ] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<RunRow | null>(null);
  const [trace, setTrace] = useState<TraceState>({ status: "idle" });

  // Reset trace whenever the selected row changes
  useEffect(() => {
    setTrace({ status: "idle" });
  }, [selectedRow?.id]);

  async function loadTrace() {
    if (!selectedRow) return;
    setTrace({ status: "loading" });
    try {
      const res = await fetch("/api/admin/parser-diagnostics/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_string: selectedRow.input_string }),
      });
      const data: TraceResponse = await res.json();
      if (!res.ok || data.error) {
        setTrace({ status: "error", message: data.error ?? "Request failed" });
      } else {
        setTrace({ status: "done", data });
      }
    } catch (e) {
      setTrace({ status: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }

  // Unique countries for dropdown (from all rows)
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.parsed_country) set.add(r.parsed_country);
    return Array.from(set).sort();
  }, [rows]);

  // Stats from ALL rows (no filter)
  const stats = useMemo(() => {
    const durations = rows.map((r) => r.parse_duration_ms ?? 0);
    return {
      total: rows.length,
      successful: rows.filter((r) => !r.parse_error && (r.parsed_country || r.parsed_city || r.parsed_institution || r.parsed_department)).length,
      nullReturns: rows.filter((r) => !r.parse_error && !r.parsed_country && !r.parsed_city && !r.parsed_institution && !r.parsed_department).length,
      errors: rows.filter((r) => !!r.parse_error).length,
      withCountry: rows.filter((r) => !!r.parsed_country).length,
      withCity: rows.filter((r) => !!r.parsed_city).length,
      withState: rows.filter((r) => !!r.parsed_state).length,
      withInstitution: rows.filter((r) => !!r.parsed_institution).length,
      withDepartment: rows.filter((r) => !!r.parsed_department).length,
      highConf: rows.filter((r) => r.parsed_confidence === "high").length,
      lowConf: rows.filter((r) => r.parsed_confidence === "low").length,
      meanMs: rows.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10 : 0,
      medianMs: median(durations),
      p95Ms: p95(durations),
      maxMs: Math.max(0, ...durations),
    };
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterCountry !== "__all__") {
        if (filterCountry === "__null__" && r.parsed_country !== null) return false;
        if (filterCountry !== "__null__" && r.parsed_country !== filterCountry) return false;
      }
      if (filterConf !== "__all__") {
        if (filterConf === "__null__" && r.parsed_confidence !== null) return false;
        if (filterConf !== "__null__" && r.parsed_confidence !== filterConf) return false;
      }
      if (filterError === "yes" && !r.parse_error) return false;
      if (filterError === "no" && r.parse_error) return false;
      if (filterHasCountry === "yes" && !r.parsed_country) return false;
      if (filterHasCountry === "no" && r.parsed_country) return false;
      if (filterHasCity === "yes" && !r.parsed_city) return false;
      if (filterHasCity === "no" && r.parsed_city) return false;
      if (q && !r.input_string.toLowerCase().includes(q) && !r.pubmed_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filterCountry, filterConf, filterError, filterHasCountry, filterHasCity, filterQ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFilters() {
    setFilterCountry("__all__");
    setFilterConf("__all__");
    setFilterError("__all__");
    setFilterHasCountry("__all__");
    setFilterHasCity("__all__");
    setFilterQ("");
    setPage(1);
  }

  function onFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  const pct = (n: number) => stats.total > 0 ? ` (${Math.round((n / stats.total) * 100)}%)` : "";

  return (
    <>
      {/* Stats header */}
      <div style={{
        background: "#fff", borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        marginBottom: "20px", overflow: "hidden",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85" }}>
            Run statistics
          </span>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 24px" }}>
            {[
              ["Total", stats.total],
              ["Successful parses", `${stats.successful}${pct(stats.successful)}`],
              ["Null returns", `${stats.nullReturns}${pct(stats.nullReturns)}`],
              ["Errors", stats.errors],
              ["With country", `${stats.withCountry}${pct(stats.withCountry)}`],
              ["With city", `${stats.withCity}${pct(stats.withCity)}`],
              ["With state", `${stats.withState}${pct(stats.withState)}`],
              ["With institution", `${stats.withInstitution}${pct(stats.withInstitution)}`],
              ["With department", `${stats.withDepartment}${pct(stats.withDepartment)}`],
              ["High confidence", `${stats.highConf}${pct(stats.highConf)}`],
              ["Low confidence", `${stats.lowConf}${pct(stats.lowConf)}`],
              ["Mean duration", `${stats.meanMs}ms`],
              ["Median duration", `${stats.medianMs}ms`],
              ["p95 duration", `${stats.p95Ms}ms`],
              ["Max duration", `${stats.maxMs}ms`],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: "#fff", borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        marginBottom: "20px", overflow: "hidden",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85" }}>Filters</span>
          <span style={{ fontSize: "12px", color: "#9ca3af" }}>{filtered.length} / {rows.length} rows</span>
        </div>
        <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Country</label>
            <select style={SELECT_STYLE} value={filterCountry} onChange={onFilterChange(setFilterCountry)}>
              <option value="__all__">All</option>
              <option value="__null__">(null)</option>
              {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Confidence</label>
            <select style={SELECT_STYLE} value={filterConf} onChange={onFilterChange(setFilterConf)}>
              <option value="__all__">All</option>
              <option value="high">High</option>
              <option value="low">Low</option>
              <option value="__null__">(null)</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Has error</label>
            <select style={SELECT_STYLE} value={filterError} onChange={onFilterChange(setFilterError)}>
              <option value="__all__">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Has country</label>
            <select style={SELECT_STYLE} value={filterHasCountry} onChange={onFilterChange(setFilterHasCountry)}>
              <option value="__all__">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Has city</label>
            <select style={SELECT_STYLE} value={filterHasCity} onChange={onFilterChange(setFilterHasCity)}>
              <option value="__all__">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div style={{ flexGrow: 1, minWidth: "180px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>Free text</label>
            <input
              style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }}
              value={filterQ}
              onChange={onFilterChange(setFilterQ)}
              placeholder="Search input string or PubMed ID…"
            />
          </div>
          <div style={{ paddingTop: "16px" }}>
            <button
              onClick={resetFilters}
              style={{
                padding: "6px 12px", borderRadius: "6px", border: "1px solid #d1d5db",
                background: "transparent", fontFamily: "inherit", fontSize: "12px",
                color: "#5a6a85", cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["PubMed ID", "Input", "Country", "City", "State", "Institution", "Department", "Conf.", "ms", "Error"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af", padding: "32px" }}>
                    No rows match the current filters.
                  </td>
                </tr>
              ) : paginated.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  style={{ cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{row.pubmed_id}</td>
                  <td style={{ ...tdStyle, maxWidth: "280px" }}>
                    <span style={{ fontSize: "12px", color: row.input_string ? "#1a1a1a" : "#9ca3af" }}>
                      {trunc(row.input_string || "(empty)", 120)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{row.parsed_country ?? <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{row.parsed_city ?? <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{row.parsed_state ?? <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td style={{ ...tdStyle }}>{trunc(row.parsed_institution, 60)}</td>
                  <td style={{ ...tdStyle }}>{trunc(row.parsed_department, 60)}</td>
                  <td style={{ ...tdStyle }}><ConfBadge v={row.parsed_confidence} /></td>
                  <td style={{ ...tdStyle, color: "#5a6a85", whiteSpace: "nowrap" }}>{row.parse_duration_ms ?? "—"}</td>
                  <td style={{ ...tdStyle, maxWidth: "160px", color: "#dc2626", fontSize: "11px" }}>
                    {row.parse_error ? trunc(row.parse_error, 40) : <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: "12px 16px", borderTop: "1px solid #f1f3f7",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: "13px", color: "#5a6a85",
          }}>
            <span>
              Page {safePage} of {totalPages} · {filtered.length} rows
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #d1d5db", background: "transparent", cursor: safePage === 1 ? "not-allowed" : "pointer", color: safePage === 1 ? "#d1d5db" : "#374151", fontFamily: "inherit", fontSize: "12px" }}
              >«</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #d1d5db", background: "transparent", cursor: safePage === 1 ? "not-allowed" : "pointer", color: safePage === 1 ? "#d1d5db" : "#374151", fontFamily: "inherit", fontSize: "12px" }}
              >‹ Prev</button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #d1d5db", background: "transparent", cursor: safePage === totalPages ? "not-allowed" : "pointer", color: safePage === totalPages ? "#d1d5db" : "#374151", fontFamily: "inherit", fontSize: "12px" }}
              >Next ›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #d1d5db", background: "transparent", cursor: safePage === totalPages ? "not-allowed" : "pointer", color: safePage === totalPages ? "#d1d5db" : "#374151", fontFamily: "inherit", fontSize: "12px" }}
              >»</button>
            </div>
          </div>
        )}
      </div>

      {/* Row detail modal */}
      {selectedRow && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedRow(null); }}
        >
          <div style={{
            background: "#fff", borderRadius: "12px", width: "780px", maxWidth: "100%",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: "28px",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "2px" }}>PubMed ID</div>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>{selectedRow.pubmed_id}</div>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9ca3af", lineHeight: 1, padding: "2px 6px" }}
              >×</button>
            </div>

            {/* Input string */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: "6px" }}>Input string</div>
              <div style={{
                background: "#f8f9fb", borderRadius: "8px", padding: "12px 14px",
                fontSize: "13px", lineHeight: "1.6", color: "#1a1a1a",
                wordBreak: "break-word", whiteSpace: "pre-wrap",
              }}>
                {selectedRow.input_string || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(empty)</span>}
              </div>
            </div>

            {/* Parsed fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
              {[
                ["Country", selectedRow.parsed_country],
                ["City", selectedRow.parsed_city],
                ["State", selectedRow.parsed_state],
                ["Institution", selectedRow.parsed_institution],
                ["Department", selectedRow.parsed_department],
                ["Confidence", selectedRow.parsed_confidence],
                ["Duration (ms)", selectedRow.parse_duration_ms?.toString() ?? null],
                ["Error", selectedRow.parse_error],
              ].map(([label, value]) => (
                <div key={label as string} style={{ background: "#f8f9fb", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: value ? "#1a1a1a" : "#d1d5db", wordBreak: "break-word" }}>
                    {value ?? "—"}
                  </div>
                </div>
              ))}
            </div>

            {/* Trace section */}
            <div style={{ borderTop: "1px solid #f1f3f7", paddingTop: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: "12px" }}>
                Parser trace
              </div>

              {trace.status === "idle" && (
                <button
                  onClick={loadTrace}
                  style={{
                    padding: "8px 16px", borderRadius: "7px", border: "none",
                    background: "#1a1a1a", color: "#fff", fontFamily: "inherit",
                    fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Load trace
                </button>
              )}

              {trace.status === "loading" && (
                <div style={{ fontSize: "13px", color: "#9ca3af" }}>Loading…</div>
              )}

              {trace.status === "error" && (
                <div>
                  <div style={{ fontSize: "13px", color: "#dc2626", marginBottom: "8px" }}>{trace.message}</div>
                  <button
                    onClick={loadTrace}
                    style={{
                      padding: "6px 12px", borderRadius: "6px", border: "1px solid #fca5a5",
                      background: "#fef2f2", color: "#b91c1c", fontFamily: "inherit",
                      fontSize: "12px", cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {trace.status === "done" && (
                <div>
                  {/* Summary line */}
                  <div style={{
                    fontSize: "12px", color: "#374151", marginBottom: "10px",
                    padding: "8px 12px", background: "#f8f9fb", borderRadius: "6px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                  }}>
                    <span>
                      {trace.data.result
                        ? <>Result: country=<b>{trace.data.result.country ?? "null"}</b>, city=<b>{trace.data.result.city ?? "null"}</b>, confidence=<b>{trace.data.result.confidence}</b>, duration=<b>{trace.data.duration_ms}ms</b></>
                        : <>Result: <b>null</b> · duration=<b>{trace.data.duration_ms}ms</b></>
                      }
                    </span>
                    <button
                      onClick={loadTrace}
                      style={{
                        padding: "3px 10px", borderRadius: "5px", border: "1px solid #d1d5db",
                        background: "transparent", fontFamily: "inherit", fontSize: "11px",
                        color: "#5a6a85", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      Re-run
                    </button>
                  </div>

                  {/* Trace lines */}
                  <div style={{
                    maxHeight: "400px", overflowY: "auto",
                    background: "#1a1a1a", borderRadius: "8px",
                    padding: "14px 16px",
                  }}>
                    {trace.data.trace.map((line, i) => (
                      <div key={i} style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: "12px", lineHeight: "1.5", color: "#e5e7eb",
                        whiteSpace: "pre",
                      }}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
