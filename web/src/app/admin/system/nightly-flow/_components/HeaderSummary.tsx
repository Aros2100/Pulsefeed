"use client";
import type { Summary, Irregularity } from "../_lib/types";
import { fmtDate, fmtTime } from "../_lib/format";

const PILL_BG: Record<string, string> = {
  ok:    "#dcfce7", warn:  "#fef3c7", error: "#fee2e2",
};
const PILL_TEXT: Record<string, string> = {
  ok:    "#15803d", warn:  "#92400e", error: "#b91c1c",
};
const PILL_BORDER: Record<string, string> = {
  ok:    "#86efac", warn:  "#fcd34d", error: "#fca5a5",
};

export function HeaderSummary({
  summary,
  date,
  windowStart,
  windowEnd,
  irregularities,
  onIrregularityClick,
}: {
  summary: Summary;
  date: string;
  windowStart: string;
  windowEnd: string;
  irregularities: Irregularity[];
  onIrregularityClick: (component: string) => void;
}) {
  const hs = summary.headline_status;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #dde3ed",
      borderRadius: "10px",
      padding: "16px 20px",
      marginBottom: "20px",
    }}>
      {/* Row 1: date + headline pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a" }}>
          {fmtDate(date)}
        </div>
        <div style={{
          background: PILL_BG[hs] ?? "#f3f4f6",
          color:      PILL_TEXT[hs] ?? "#374151",
          border:     `1px solid ${PILL_BORDER[hs] ?? "#d1d5db"}`,
          borderRadius: "999px",
          padding: "3px 12px",
          fontSize: "12px",
          fontWeight: 600,
        }}>
          {summary.headline_status === "ok" ? "✅" : summary.headline_status === "warn" ? "⚠️" : "❌"}
          {" "}{summary.headline_text}
        </div>
      </div>

      {/* Row 2: window + counts */}
      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: irregularities.length > 0 ? "10px" : 0 }}>
        {fmtTime(windowStart)} → {fmtTime(windowEnd)} UTC
        <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
        {summary.ok_count} ok
        {summary.warn_count > 0 && <> · <span style={{ color: "#92400e", fontWeight: 600 }}>{summary.warn_count} warn</span></>}
        {summary.error_count > 0 && <> · <span style={{ color: "#b91c1c", fontWeight: 600 }}>{summary.error_count} error</span></>}
        <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
        {summary.total_components} components
      </div>

      {/* Row 3: irregularities */}
      {irregularities.length > 0 && (
        <div style={{ borderTop: "0.5px solid #e5e9f0", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {irregularities.map((irr, i) => (
            <button
              key={i}
              onClick={() => onIrregularityClick(irr.component)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "none", border: "none", cursor: "pointer",
                textAlign: "left", padding: "2px 0",
                fontSize: "12px",
                color: irr.severity === "error" ? "#b91c1c" : "#92400e",
              }}
            >
              <span>{irr.severity === "error" ? "❌" : "⚠️"}</span>
              <span style={{ fontWeight: 600 }}>{irr.component}</span>
              <span style={{ opacity: 0.7 }}>— {irr.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
