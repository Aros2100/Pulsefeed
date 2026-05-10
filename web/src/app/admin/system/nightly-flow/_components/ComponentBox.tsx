"use client";
import type { ComponentBox as ComponentBoxType } from "../_lib/types";
import { STATUS_ICON, STATUS_BG, STATUS_BORDER, STATUS_TEXT } from "./statusStyles";
import { getBoxContent } from "../_lib/boxContent";

export function ComponentBox({
  id,
  box,
  onExpand,
}: {
  id: string;
  box: ComponentBoxType;
  onExpand: (id: string) => void;
}) {
  const content = getBoxContent(id, box);
  const bg     = STATUS_BG[box.status];
  const border = STATUS_BORDER[box.status];
  const text   = STATUS_TEXT[box.status];
  const icon   = STATUS_ICON[box.status];

  return (
    <div
      id={`box-${id}`}
      onClick={() => onExpand(id)}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
        color: text,
        minHeight: "80px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      {/* Line 1: heading + status icon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1.3, flex: 1 }}>
          {box.heading}
        </div>
        <span style={{ fontSize: "13px", flexShrink: 0 }}>{icon}</span>
      </div>

      {/* Line 2: explanation */}
      {content.explanation && (
        <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: 1.3 }}>
          {content.explanation}
        </div>
      )}

      {/* Line 3: technical name */}
      {box.technical_name && (
        <div style={{ fontSize: "10px", fontFamily: "monospace", opacity: 0.55, marginTop: "1px" }}>
          {box.technical_name}
        </div>
      )}

      {/* Line 4: counts */}
      {content.counts && box.status !== "expected_silent" && box.status !== "missing" && (
        <div style={{ fontSize: "10px", fontWeight: 500, marginTop: "4px", lineHeight: 1.4 }}>
          {content.counts}
        </div>
      )}

      {/* Line 5: extra / latency */}
      {content.extra && box.status !== "expected_silent" && box.status !== "missing" && (
        <div style={{ fontSize: "10px", opacity: 0.75, lineHeight: 1.4 }}>
          {content.extra}
        </div>
      )}

      {/* Empty state */}
      {(box.status === "expected_silent" || box.status === "missing") && (
        <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "4px" }}>
          {box.status === "expected_silent" ? "No batches this night" : "No data for this component"}
        </div>
      )}
    </div>
  );
}
