"use client";

import { useState } from "react";

interface VersionRow {
  version: string;
  active: boolean;
  decisions: number;
  agreements: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  period: string;
  confBuckets: { label: string; count: number }[];
  topReasons: { reason: string; count: number }[];
}

function accColor(v: number | null): string {
  if (v == null) return "#888";
  if (v >= 85) return "#16a34a";
  if (v >= 70) return "#ea580c";
  return "#dc2626";
}

interface Props {
  versions: VersionRow[];
  variant?: string;  // "specialty-tag" shows FP/FN columns, anything else shows Agreements/Corrected
}

export default function BenchmarkTable({ versions, variant = "specialty-tag" }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isCls = variant !== "specialty-tag";
  const gridCols = isCls
    ? "130px 100px 100px 80px 100px 1fr"
    : "130px 100px 100px 55px 55px 100px 1fr";

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: gridCols,
        padding: "10px 24px", borderBottom: "1px solid #e8ecf1",
        fontSize: "11px", color: "#888", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        <div>Version</div>
        <div>Beslutninger</div>
        <div>{isCls ? (variant === "condensation" ? "Approved" : "Agreements") : "Agreement"}</div>
        <div>{isCls ? (variant === "condensation" ? "Rejected" : "Corrected") : "FP"}</div>
        {!isCls && <div>FN</div>}
        <div>Nøjagtighed</div>
        <div>Periode</div>
      </div>

      {versions.map((v) => {
        const isExpanded = expandedId === v.version;
        const isHovered = hoveredId === v.version;
        const isEmpty = v.decisions === 0;

        return (
          <div key={v.version} style={{ borderBottom: "1px solid #f0f2f5" }}>
            {/* Row */}
            <div
              onClick={() => !isEmpty && setExpandedId(isExpanded ? null : v.version)}
              onMouseEnter={() => setHoveredId(v.version)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "grid", gridTemplateColumns: gridCols,
                padding: "14px 24px",
                cursor: isEmpty ? "default" : "pointer",
                fontSize: "13px", alignItems: "center",
                background: isHovered && !isEmpty ? "#fafbfc" : "transparent",
                opacity: isEmpty ? 0.4 : 1,
                transition: "background 0.15s",
              }}
            >
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                {/* Chevron */}
                {!isEmpty && (
                  <span style={{
                    display: "inline-block",
                    fontSize: "10px",
                    color: "#aaa",
                    transition: "transform 0.2s",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    width: "12px",
                    flexShrink: 0,
                  }}>
                    ▶
                  </span>
                )}
                {isEmpty && <span style={{ width: "12px", flexShrink: 0 }} />}
                {v.version}
                {v.active && (
                  <span style={{ fontSize: "10px", fontWeight: 700, background: "#16a34a", color: "#fff", borderRadius: "3px", padding: "1px 6px" }}>
                    Aktiv
                  </span>
                )}
              </div>
              <div style={{ color: "#5a6a85" }}>{v.decisions}</div>
              <div>{v.agreements}</div>
              <div style={{ color: v.fp > 30 ? "#ea580c" : v.fp > 0 ? "#1a1a1a" : "#aaa", fontWeight: v.fp > 30 ? 700 : 400 }}>
                {v.fp}
              </div>
              {!isCls && (
                <div style={{ color: v.fn > 30 ? "#ea580c" : v.fn > 0 ? "#1a1a1a" : "#aaa", fontWeight: v.fn > 30 ? 700 : 400 }}>
                  {v.fn}
                </div>
              )}
              <div style={{ fontWeight: 700, color: accColor(v.accuracy) }}>
                {v.accuracy != null ? `${v.accuracy}%` : "—"}
              </div>
              <div style={{ fontSize: "12px", color: "#888" }}>{v.period}</div>
            </div>

            {/* Expanded details */}
            {isExpanded && !isEmpty && (
              <div style={{
                padding: "4px 24px 20px 50px",
                background: "#fafbfc",
                borderTop: "1px solid #f0f2f5",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>

                  {/* Confidence distribution */}
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                      Confidence-fordeling
                    </div>
                    {v.confBuckets.every((b) => b.count === 0) ? (
                      <div style={{ fontSize: "12px", color: "#aaa" }}>Ingen data</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {v.confBuckets.map((b) => {
                          const maxCount = Math.max(...v.confBuckets.map((x) => x.count), 1);
                          const w = Math.round((b.count / maxCount) * 100);
                          return (
                            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ fontSize: "11px", color: "#5a6a85", width: "60px", textAlign: "right", flexShrink: 0, fontWeight: 600 }}>
                                {b.label}
                              </div>
                              <div style={{ flex: 1, height: "16px", background: "#e8ecf1", borderRadius: "4px", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%", width: `${w}%`, minWidth: b.count > 0 ? "4px" : 0,
                                  background: "linear-gradient(90deg, #60a5fa, #3b82f6)",
                                  borderRadius: "4px",
                                }} />
                              </div>
                              <div style={{ fontSize: "12px", color: "#1a1a1a", width: "32px", flexShrink: 0, fontWeight: 600 }}>
                                {b.count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Top rejection reasons */}
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                      Hyppigste afvisningsårsager
                    </div>
                    {v.topReasons.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#aaa" }}>Ingen uenigheder med årsag</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {v.topReasons.map((r, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "#1a1a1a", display: "flex", gap: "6px", lineHeight: 1.5 }}>
                            <span style={{ color: "#ea580c", fontWeight: 700, flexShrink: 0 }}>•</span>
                            <span style={{ flex: 1 }}>{r.reason}</span>
                            <span style={{ color: "#5a6a85", flexShrink: 0, fontWeight: 600 }}>({r.count})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
