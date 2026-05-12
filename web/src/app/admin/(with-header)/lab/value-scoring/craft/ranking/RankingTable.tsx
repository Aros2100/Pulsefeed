"use client";

import React, { useState } from "react";
import PairDetailModal from "./PairDetailModal";

export interface ArticlePairDetail {
  pairId:     string;
  result:     "won" | "lost";
  opponent:   { id: string; title: string; article_type: string | null; beta: number | null };
  categories: string[];
}

export interface RankedArticle {
  id:           string;
  title:        string;
  article_type: string | null;
  wins:         number;
  losses:       number;
  beta:         number | null;
  pairs:        ArticlePairDetail[];
}

interface Props {
  ranked: RankedArticle[];
}

export default function RankingTable({ ranked }: Props) {
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set());
  const [activePairId,   setActivePairId]   = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#fafbfc" }}>
          <th style={{ ...thStyle, width: "28px", padding: "10px 6px 10px 16px" }} />
          <th style={{ ...thStyle, width: "44px" }}>#</th>
          <th style={thStyle}>Title</th>
          <th style={{ ...thStyle, width: "140px" }}>Article type</th>
          <th style={{ ...thStyle, width: "80px", textAlign: "right" }}>BT score</th>
          <th style={{ ...thStyle, width: "76px", textAlign: "right" }}>NFL</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((r, i) => {
          const isOpen = expanded.has(r.id);
          return (
            <React.Fragment key={r.id}>
              <tr
                onClick={() => toggle(r.id)}
                style={{
                  borderTop: "1px solid #f5f5f5",
                  cursor: "pointer",
                  background: isOpen ? "#fafbfc" : undefined,
                }}
              >
                <td style={{ ...tdStyle, padding: "10px 4px 10px 16px", color: "#94a3b8", fontSize: "11px", userSelect: "none" }}>
                  {isOpen ? "▾" : "▸"}
                </td>
                <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                <td style={{ ...tdStyle, color: "#1a1a1a" }} title={r.title}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "360px" }}>
                    {r.title}
                  </div>
                </td>
                <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{r.article_type ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: r.beta === null ? "#bbb" : r.beta >= 7.5 ? "#059669" : r.beta >= 3.5 ? "#1a1a1a" : "#b91c1c", fontVariantNumeric: "tabular-nums" }}>
                  {r.beta === null ? "—" : r.beta.toFixed(1)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: (r.wins + r.losses) === 0 ? "#bbb" : "#5a6a85", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                  {(r.wins + r.losses) === 0 ? "—" : `${r.wins}-${r.losses}`}
                </td>
              </tr>

              {isOpen && (
                <tr key={r.id + "-detail"} style={{ background: "#fafbfc" }}>
                  <td colSpan={6} style={{ padding: "0 16px 12px 44px", borderTop: "none" }}>
                    {r.pairs.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#94a3b8", padding: "8px 0" }}>No decided pairs yet.</div>
                    ) : (
                      <div style={{ borderTop: "1px solid #eef0f3", paddingTop: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "8px" }}>
                          Pairs ({r.pairs.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {r.pairs.map((p, pi) => (
                            <div
                              key={pi}
                              onClick={e => { e.stopPropagation(); setActivePairId(p.pairId); }}
                              style={{
                                display: "flex", alignItems: "baseline", gap: "10px", fontSize: "12px",
                                padding: "4px 6px", borderRadius: "5px", cursor: "pointer",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f0f4f8")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              <span style={{
                                minWidth: "38px", fontWeight: 700, fontSize: "11px",
                                color: p.result === "won" ? "#059669" : "#b91c1c", flexShrink: 0,
                              }}>
                                {p.result === "won" ? "Won" : "Lost"}
                              </span>
                              <span style={{ color: "#94a3b8", flexShrink: 0 }}>·</span>
                              <span
                                title={p.opponent.title}
                                style={{
                                  flex: "0 1 auto",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "300px",
                                  color: "#1a1a1a",
                                }}
                              >
                                {p.opponent.title}
                              </span>
                              <span style={{ color: "#94a3b8", flexShrink: 0 }}>·</span>
                              <span style={{
                                flexShrink: 0, fontWeight: 600, fontSize: "11px",
                                color: p.opponent.beta === null ? "#bbb" : p.opponent.beta >= 7.5 ? "#059669" : p.opponent.beta >= 3.5 ? "#5a6a85" : "#b91c1c",
                              }}>
                                BT {p.opponent.beta === null ? "—" : p.opponent.beta.toFixed(1)}
                              </span>
                              {p.categories.length > 0 && (
                                <>
                                  <span style={{ color: "#94a3b8", flexShrink: 0 }}>·</span>
                                  <span style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                    {p.categories.map(cat => (
                                      <span key={cat} style={{
                                        fontSize: "10px", fontWeight: 600,
                                        background: "#eef0f3", color: "#5a6a85",
                                        borderRadius: "4px", padding: "1px 6px",
                                      }}>
                                        {cat}
                                      </span>
                                    ))}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
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
    <PairDetailModal pairId={activePairId} onClose={() => setActivePairId(null)} />
    </>
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
