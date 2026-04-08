"use client";

import { useEffect, useState, useRef } from "react";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
];

type Row = { article_type: string; n: number };

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  row: Row;
  color: string;
  pct: number;
};

function buildTreemap(rows: Row[], x: number, y: number, w: number, h: number): Rect[] {
  if (rows.length === 0) return [];
  if (rows.length === 1) {
    return [{ x, y, w, h, row: rows[0], color: COLORS[0], pct: 1 }];
  }

  const total = rows.reduce((s, r) => s + r.n, 0);

  function split(
    items: Row[],
    bx: number,
    by: number,
    bw: number,
    bh: number,
    colorOffset: number,
  ): Rect[] {
    if (items.length === 0) return [];
    if (items.length === 1) {
      const pct = items[0].n / total;
      return [{
        x: bx, y: by, w: bw, h: bh,
        row: items[0],
        color: COLORS[colorOffset % COLORS.length],
        pct,
      }];
    }

    // Find split index that balances the two halves
    const half = items.reduce((s, r) => s + r.n, 0) / 2;
    let acc = 0;
    let splitIdx = 1;
    for (let i = 0; i < items.length - 1; i++) {
      acc += items[i].n;
      if (acc >= half) { splitIdx = i + 1; break; }
    }

    const leftItems  = items.slice(0, splitIdx);
    const rightItems = items.slice(splitIdx);
    const leftSum    = leftItems.reduce((s, r) => s + r.n, 0);
    const rightSum   = rightItems.reduce((s, r) => s + r.n, 0);
    const ratio      = leftSum / (leftSum + rightSum);

    if (bw >= bh) {
      // Split horizontally
      const leftW  = Math.round(bw * ratio);
      const rightW = bw - leftW;
      return [
        ...split(leftItems,  bx,          by, leftW,  bh, colorOffset),
        ...split(rightItems, bx + leftW,  by, rightW, bh, colorOffset + leftItems.length),
      ];
    } else {
      // Split vertically
      const topH    = Math.round(bh * ratio);
      const bottomH = bh - topH;
      return [
        ...split(leftItems,  bx, by,          bw, topH,    colorOffset),
        ...split(rightItems, bx, by + topH,   bw, bottomH, colorOffset + leftItems.length),
      ];
    }
  }

  return split(rows, x, y, w, h, 0);
}

const TREEMAP_H = 280;
const GAP = 2;

function abbreviate(label: string, w: number): string {
  if (w >= 120) return label;
  if (w >= 70) {
    const words = label.split(/\s+/);
    if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase();
    return label.slice(0, Math.max(3, Math.floor(w / 10)));
  }
  return "";
}

export default function ArticleTypeChart({ specialty }: { specialty: string }) {
  const [rows, setRows]         = useState<Row[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [width, setWidth]       = useState(0);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch data
  useEffect(() => {
    fetch(`/api/article-type-distribution?specialty=${encodeURIComponent(specialty)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setRows(json.data);
      })
      .finally(() => setLoading(false));
  }, [specialty]);

  const total = rows.reduce((s, r) => s + r.n, 0);

  const rects: Rect[] = width > 0 && rows.length > 0
    ? buildTreemap(rows, 0, 0, width, TREEMAP_H)
    : [];

  function toggle(type: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const hasSelection = selected.size > 0;

  // Info panel content
  const selectedRows = rows.filter((r) => selected.has(r.article_type));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.n, 0);

  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      padding: "20px 24px 16px",
    }}>
      {/* Section label */}
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
        textTransform: "uppercase", fontWeight: 700, marginBottom: "12px",
      }}>
        Article types
      </div>

      {/* Treemap */}
      <div ref={containerRef} style={{ width: "100%", height: TREEMAP_H, position: "relative", borderRadius: "6px", overflow: "hidden" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "13px" }}>
            Loading…
          </div>
        )}
        {!loading && rects.map((rect) => {
          const isSelected  = selected.has(rect.row.article_type);
          const isDimmed    = hasSelection && !isSelected;
          const label       = abbreviate(rect.row.article_type, rect.w - GAP * 2);
          const showPct     = rect.h >= 48 && label.length > 0;

          return (
            <div
              key={rect.row.article_type}
              onClick={() => toggle(rect.row.article_type)}
              style={{
                position: "absolute",
                left:   rect.x + GAP,
                top:    rect.y + GAP,
                width:  rect.w - GAP * 2,
                height: rect.h - GAP * 2,
                background: rect.color,
                borderRadius: "4px",
                cursor: "pointer",
                opacity: isDimmed ? 0.25 : 1,
                transition: "opacity 0.15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                padding: "6px 8px",
                overflow: "hidden",
                boxSizing: "border-box",
                outline: isSelected ? "2px solid rgba(255,255,255,0.9)" : "none",
                outlineOffset: "-2px",
              }}
            >
              {label && (
                <div style={{
                  fontSize: rect.w < 80 ? "10px" : "12px",
                  fontWeight: 600,
                  color: "#fff",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                }}>
                  {label}
                </div>
              )}
              {showPct && (
                <div style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.8)",
                  marginTop: "2px",
                  whiteSpace: "nowrap",
                }}>
                  {Math.round(rect.pct * 100)}%
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info panel */}
      <div style={{ marginTop: "12px", minHeight: "36px" }}>
        {!hasSelection ? (
          <div style={{ fontSize: "12px", color: "#aaa" }}>
            Click a tile to see details
          </div>
        ) : selectedRows.length === 1 ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
              {selectedRows[0].article_type}
            </div>
            <div style={{ fontSize: "12px", color: "#5a6a85" }}>
              {selectedRows[0].n.toLocaleString()} articles
            </div>
            <div style={{ fontSize: "12px", color: "#5a6a85" }}>
              {Math.round((selectedRows[0].n / total) * 100)}%
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {selectedRows.map((r) => (
              <div key={r.article_type} style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#1a1a1a", minWidth: "160px" }}>
                  {r.article_type}
                </div>
                <div style={{ fontSize: "12px", color: "#5a6a85" }}>
                  {r.n.toLocaleString()}
                </div>
                <div style={{ fontSize: "12px", color: "#5a6a85" }}>
                  {Math.round((r.n / total) * 100)}%
                </div>
              </div>
            ))}
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a", marginTop: "4px", borderTop: "1px solid #eee", paddingTop: "4px" }}>
              Total selected: {selectedTotal.toLocaleString()} ({Math.round((selectedTotal / total) * 100)}%)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
