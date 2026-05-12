"use client";

import React, { useState } from "react";
import type { QuickResultRow } from "@/lib/lab/value-scoring/prompt-versions";

const MODEL_SHORT: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6":         "Sonnet 4.6",
  "claude-opus-4-7":           "Opus 4.7",
};

interface Props {
  rows: QuickResultRow[];
  quickRho: number | null;
}

export default function QuickTestTable({ rows, quickRho }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
            Quick test · {rows.length} articles
          </span>
          {rows[0]?.scoring_model && (
            <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "12px" }}>
              Scored with {MODEL_SHORT[rows[0].scoring_model] ?? rows[0].scoring_model}
              {rows[0].scored_at && <> · {new Date(rows[0].scored_at).toLocaleDateString("en-CA")}</>}
            </span>
          )}
        </div>
        {quickRho !== null && (
          <span style={{ fontSize: "11px", color: "#5a6a85" }}>
            Spearman ρ (BT vs prompt score):{" "}
            <strong style={{ color: quickRho >= 0.7 ? "#059669" : quickRho >= 0.4 ? "#92400e" : "#b91c1c" }}>
              {quickRho.toFixed(2)}
            </strong>
          </span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafbfc" }}>
            <th style={{ ...thStyle, width: "28px", padding: "10px 4px 10px 12px" }} />
            <th style={{ ...thStyle, width: "36px" }}>#</th>
            <th style={thStyle}>Title</th>
            <th style={{ ...thStyle, width: "140px" }}>Article type</th>
            <th style={{ ...thStyle, width: "80px", textAlign: "right" }}>BT score</th>
            <th style={{ ...thStyle, width: "90px", textAlign: "right" }}>Prompt score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isOpen = expanded.has(r.article_id);
            return (
              <React.Fragment key={r.article_id}>
                <tr
                  onClick={() => toggle(r.article_id)}
                  style={{ borderTop: "1px solid #f5f5f5", cursor: "pointer", background: isOpen ? "#fafbfc" : undefined }}
                >
                  <td style={{ ...tdStyle, padding: "10px 4px 10px 12px", color: "#94a3b8", fontSize: "11px", userSelect: "none" }}>
                    {isOpen ? "▾" : "▸"}
                  </td>
                  <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, color: "#1a1a1a" }} title={r.title}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>
                      {r.title}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{r.article_type ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: r.normalizedScore === null ? "#bbb" : r.normalizedScore >= 7.5 ? "#059669" : r.normalizedScore >= 3.5 ? "#1a1a1a" : "#b91c1c" }}>
                    {r.normalizedScore === null ? "—" : r.normalizedScore.toFixed(1)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums",
                    color: r.score === null ? "#b91c1c" : "#1a1a1a" }}>
                    {r.score === null ? "failed" : r.score.toFixed(2)}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={r.article_id + "-reasoning"} style={{ background: "#fafbfc" }}>
                    <td colSpan={6} style={{ padding: "0 16px 12px 50px", borderTop: "none" }}>
                      {r.reasoning ? (
                        <div style={{
                          marginTop: "8px",
                          borderLeft: "3px solid #e5e7eb",
                          paddingLeft: "14px",
                          fontSize: "12px",
                          color: "#374151",
                          lineHeight: 1.65,
                          whiteSpace: "pre-wrap",
                        }}>
                          {r.reasoning}
                        </div>
                      ) : (
                        <div style={{ marginTop: "8px", fontSize: "12px", color: "#94a3b8" }}>
                          No reasoning recorded for this article.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#5a6a85",
  padding: "10px 16px",
};

const tdStyle: React.CSSProperties = {
  fontSize: "13px",
  padding: "10px 16px",
};
