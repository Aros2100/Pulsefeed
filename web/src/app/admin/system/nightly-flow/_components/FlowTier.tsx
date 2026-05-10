"use client";
import type { ComponentBox as ComponentBoxType } from "../_lib/types";
import { ComponentBox } from "./ComponentBox";

type BoxWidth = "third" | "half" | "full";

type TierBox = {
  id: string;
  box: ComponentBoxType;
  width: BoxWidth;
};

const COL_GRID: Record<BoxWidth, string> = {
  third: "repeat(3, 1fr)",
  half:  "repeat(2, 1fr)",
  full:  "1fr",
};

export function FlowTier({
  title,
  timeLabel,
  boxes,
  showArrowDown = false,
  showConvergeArrows = false,
  onBoxClick,
}: {
  title?: string;
  timeLabel?: string;
  boxes: TierBox[];
  showArrowDown?: boolean;
  showConvergeArrows?: boolean;
  onBoxClick: (id: string) => void;
}) {
  const colCount = boxes.length;
  const gridCols = boxes.length === 1 ? "1fr" : COL_GRID[boxes[0].width] || `repeat(${colCount}, 1fr)`;

  return (
    <div style={{ marginBottom: "4px" }}>
      {/* Tier header */}
      {(title || timeLabel) && (
        <div style={{
          display: "flex", alignItems: "baseline", gap: "8px",
          marginBottom: "6px", paddingLeft: "2px",
        }}>
          {title && (
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {title}
            </span>
          )}
          {timeLabel && (
            <span style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
              {timeLabel} UTC
            </span>
          )}
        </div>
      )}

      {/* Convergence arrows (from 3 circles → 1 combined box) */}
      {showConvergeArrows && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2px" }}>
          <svg width="100%" height="28" viewBox="0 0 300 28" preserveAspectRatio="none" style={{ maxWidth: "600px" }}>
            <line x1="50"  y1="0" x2="150" y2="28" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="150" y1="0" x2="150" y2="28" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="250" y1="0" x2="150" y2="28" stroke="#94a3b8" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* Boxes */}
      <div style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: "8px",
      }}>
        {boxes.map(({ id, box }) => (
          <ComponentBox key={id} id={id} box={box} onExpand={onBoxClick} />
        ))}
      </div>

      {/* Arrow down */}
      {showArrowDown && (
        <div style={{ textAlign: "center", fontSize: "14px", color: "#94a3b8", margin: "4px 0 2px" }}>
          ↓
        </div>
      )}
    </div>
  );
}
