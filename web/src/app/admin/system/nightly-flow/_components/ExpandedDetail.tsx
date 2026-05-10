"use client";
import type { NightlyFlowReport, ComponentBox } from "../_lib/types";
import { STATUS_ICON } from "./statusStyles";

function findBoxById(report: NightlyFlowReport, id: string): ComponentBox | null {
  const all: Record<string, ComponentBox> = {
    ...report.tier1_import_circles,
    ...report.tier1_combined,
    ...report.tier2_sync_authorlink,
    ...report.tier3_autotag_authorupdate,
    ...report.tier4_specialty_scoring,
    ...report.tier5_autotag_articletype,
    ...report.tier6_scoring_swarm,
    ...report.tier7_sari,
    ...report.tier8_result,
    ...report.tier9_background,
  };
  return all[id] ?? null;
}

export function ExpandedDetail({
  boxId,
  report,
  onClose,
}: {
  boxId: string;
  report: NightlyFlowReport;
  onClose: () => void;
}) {
  const box = findBoxById(report, boxId);
  if (!box) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 49,
        }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "400px",
        background: "#fff", borderLeft: "1px solid #dde3ed",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
        padding: "24px", overflowY: "auto", zIndex: 50,
        fontFamily: "var(--font-inter), Inter, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a1a", marginBottom: "3px" }}>
              {box.heading}
            </div>
            {box.technical_name && (
              <div style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>
                {box.technical_name}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "20px", color: "#94a3b8", lineHeight: 1, padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: "12px", fontSize: "13px" }}>
          {STATUS_ICON[box.status]} {box.status}
        </div>

        {box.timing && (
          <div style={{
            background: "#f8fafc", borderRadius: "6px", padding: "10px 12px",
            fontSize: "11px", color: "#64748b", marginBottom: "12px", lineHeight: 1.6,
          }}>
            <div>Start: {box.timing.started_at}</div>
            <div>End: {box.timing.completed_at}</div>
            <div>Duration: {box.timing.duration_sec}s</div>
          </div>
        )}

        <div style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
          Details
        </div>
        <pre style={{
          fontSize: "11px", background: "#f8fafc", padding: "12px",
          borderRadius: "6px", overflowX: "auto", lineHeight: 1.5,
          color: "#334155", border: "0.5px solid #e2e8f0",
        }}>
          {JSON.stringify(box.details, null, 2)}
        </pre>
      </div>
    </>
  );
}
