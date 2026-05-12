"use client";

import React, { useState } from "react";
import type { DisagreementRow } from "@/lib/lab/value-scoring/evaluation";

type Sari = { subject?: string; action?: string; result?: string; implication?: string } | null;
export interface ArticleFull {
  id:              string;
  title:           string;
  journal:         string | null;
  article_type:    string | null;
  published_date:  string | null;
  pmid:            string | null;
  short_headline:  string | null;
  resume:          string | null;
  bottom_line:     string | null;
  sari:            Sari;
}

interface Props {
  rows:             DisagreementRow[];
  articles:         Record<string, ArticleFull>;
  onFilterChange?:  (pairIds: string[]) => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DisagreementList({ rows, articles, onFilterChange }: Props) {
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [minCraftDiff, setMinCraftDiff] = useState(0);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = minCraftDiff > 0
    ? rows.filter(r => r.craftDiff >= minCraftDiff)
    : rows;

  // Notify parent whenever the visible set changes so the iterate button
  // can pick up the filtered pair IDs.
  React.useEffect(() => {
    onFilterChange?.(filtered.map(r => r.pairId));
  }, [filtered, onFilterChange]);

  if (rows.length === 0) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
        No disagreements.
      </div>
    );
  }

  return (
    <>
      {/* Filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderBottom: "1px solid #f0f0f0", background: "#fafbfc" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85" }}>
          Min craft diff
          <input
            type="number"
            min={0}
            step={1}
            value={minCraftDiff}
            onChange={e => setMinCraftDiff(Math.max(0, Number(e.target.value) || 0))}
            style={{
              width: "56px",
              padding: "3px 7px",
              fontSize: "13px",
              fontWeight: 400,
              border: "1px solid #e5e7eb",
              borderRadius: "5px",
              color: "#1a1a1a",
              background: "#fff",
              textTransform: "none",
              letterSpacing: 0,
            }}
          />
        </label>
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
          {minCraftDiff > 0
            ? `showing ${filtered.length} of ${rows.length}`
            : `showing all ${rows.length}`}
        </span>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
          No disagreements with craft diff ≥ {minCraftDiff}.
        </div>
      )}

      {filtered.length > 0 && (
    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
      <colgroup>
        <col style={{ width: "30px" }} />
        <col style={{ width: "28%" }} />
        <col style={{ width: "28%" }} />
        <col style={{ width: "130px" }} />
        <col />
      </colgroup>
      <thead>
        <tr style={{ background: "#fafbfc" }}>
          <th style={{ ...thStyle, width: "30px" }} />
          <th style={thStyle}>Your choice</th>
          <th style={thStyle}>Prompt choice</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Craft</th>
          <th style={thStyle}>Reasons</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(r => {
          const open = expanded.has(r.pairId);
          const humanArt  = r.humanChoiceId === r.articleA.id ? r.articleA : r.articleB;
          const promptArt = r.promptChoiceId === null
            ? null
            : r.promptChoiceId === r.articleA.id ? r.articleA : r.articleB;
          const humanCraft  = r.humanChoiceId === r.articleA.id ? r.craftScoreA : r.craftScoreB;
          const promptCraft = r.promptChoiceId === null
            ? null
            : r.promptChoiceId === r.articleA.id ? r.craftScoreA : r.craftScoreB;
          const humanDims   = r.humanChoiceId === r.articleA.id ? r.dimensionsA : r.dimensionsB;
          const scoredCount = humanDims ? Object.values(humanDims).filter(v => v !== null).length : null;
          const totalCount  = humanDims ? Object.keys(humanDims).length : null;
          const dimsLabel   = scoredCount !== null && totalCount !== null ? ` (${scoredCount}/${totalCount})` : "";
          const craftCell   = humanCraft !== null && promptCraft !== null
            ? `${humanCraft.toFixed(0)} / ${promptCraft.toFixed(0)} · Δ${r.craftDiff.toFixed(0)}${dimsLabel}`
            : "—";
          return (
            <React.Fragment key={r.pairId}>
              <tr onClick={() => toggle(r.pairId)} style={{ borderTop: "1px solid #f5f5f5", cursor: "pointer" }}>
                <td style={{ ...tdStyle, color: "#94a3b8" }}>{open ? "▾" : "▸"}</td>
                <td style={{ ...tdStyle, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={humanArt.title}>
                  {humanArt.title}
                </td>
                <td style={{ ...tdStyle, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={promptArt?.title ?? "(tie)"}>
                  {promptArt ? promptArt.title : <em style={{ color: "#94a3b8" }}>(prompt tied)</em>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: humanCraft !== null && promptCraft !== null ? "#1a1a1a" : "#bbb", fontSize: "12px", whiteSpace: "nowrap" }}>
                  {craftCell}
                </td>
                <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.reasons.length > 0 ? r.reasons.join(" · ") : <span style={{ color: "#bbb" }}>—</span>}
                </td>
              </tr>
              {open && (
                <tr key={r.pairId + "-detail"} style={{ background: "#fafbfc" }}>
                  <td colSpan={5} style={{ padding: "16px 24px" }}>
                    {/* YOUR CHOICE always left, PROMPT always right.
                        minWidth: 0 on each ArticlePanel root div is essential — without it,
                        CSS grid children expand to fit their content instead of their track.
                        The table-layout: fixed on <table> caps this <td> to table width. */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      {/* Human-chosen panel */}
                      {r.humanChoiceId === r.articleA.id ? (
                        <ArticlePanel
                          article={articles[r.articleA.id]}
                          chosenByHuman
                          chosenByPrompt={r.promptChoiceId === r.articleA.id}
                          craftScore={r.craftScoreA}
                          dimensions={r.dimensionsA}
                          reasoning={r.reasoningA}
                        />
                      ) : (
                        <ArticlePanel
                          article={articles[r.articleB.id]}
                          chosenByHuman
                          chosenByPrompt={r.promptChoiceId === r.articleB.id}
                          craftScore={r.craftScoreB}
                          dimensions={r.dimensionsB}
                          reasoning={r.reasoningB}
                        />
                      )}
                      {/* Prompt-chosen (or other) panel */}
                      {r.humanChoiceId === r.articleA.id ? (
                        <ArticlePanel
                          article={articles[r.articleB.id]}
                          chosenByHuman={false}
                          chosenByPrompt={r.promptChoiceId === r.articleB.id}
                          craftScore={r.craftScoreB}
                          dimensions={r.dimensionsB}
                          reasoning={r.reasoningB}
                        />
                      ) : (
                        <ArticlePanel
                          article={articles[r.articleA.id]}
                          chosenByHuman={false}
                          chosenByPrompt={r.promptChoiceId === r.articleA.id}
                          craftScore={r.craftScoreA}
                          dimensions={r.dimensionsA}
                          reasoning={r.reasoningA}
                        />
                      )}
                    </div>
                    {r.notes && (
                      <div style={{ marginTop: "16px", padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "4px" }}>Your notes</div>
                        <div style={{ fontSize: "13px", color: "#1a1a1a", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.notes}</div>
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
      )}
    </>
  );
}

function DimensionBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "10px", color: "#94a3b8", minWidth: "130px", textAlign: "right" }}>{label}</span>
        <div style={{ flex: 1, height: "3px", background: "#e5e7eb", borderRadius: "2px" }} />
        <span style={{ fontSize: "10px", color: "#94a3b8", minWidth: "20px", fontStyle: "italic" }}>n/a</span>
      </div>
    );
  }
  const pct = (value / 10) * 100;
  const color = value >= 7 ? "#059669" : value >= 4 ? "#92400e" : "#b91c1c";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      <span style={{ fontSize: "10px", color: "#5a6a85", minWidth: "130px", textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: "6px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontSize: "10px", fontWeight: 700, color, minWidth: "20px" }}>{value}</span>
    </div>
  );
}

function ArticlePanel({ article, chosenByHuman, chosenByPrompt, craftScore, dimensions, reasoning }: {
  article:        ArticleFull | undefined;
  chosenByHuman:  boolean;
  chosenByPrompt: boolean;
  craftScore:     number | null;
  dimensions:     Record<string, number | null> | null;
  reasoning:      string | null;
}) {
  if (!article) {
    return <div style={{ padding: "12px", color: "#bbb", fontSize: "13px" }}>(article missing)</div>;
  }
  const border = chosenByHuman ? "2px solid #059669" : chosenByPrompt ? "2px solid #E83B2A" : "1px solid #e5e7eb";
  return (
    <div style={{ background: "#fff", borderRadius: "8px", border, padding: "14px 16px", minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {chosenByHuman && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "#059669", padding: "2px 6px", borderRadius: "4px" }}>YOUR CHOICE</span>
          )}
          {chosenByPrompt && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "#E83B2A", padding: "2px 6px", borderRadius: "4px" }}>PROMPT</span>
          )}
        </div>
        {craftScore !== null && (
          <div style={{ fontSize: "11px", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
            craft {craftScore.toFixed(0)}
          </div>
        )}
      </div>
      <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, marginBottom: "4px", overflowWrap: "break-word" }}>{article.title}</div>
      <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "10px" }}>
        {[article.journal, fmtDate(article.published_date), article.article_type].filter(Boolean).join(" · ")}
        {article.pmid && <> · PMID {article.pmid}</>}
      </div>
      <FieldRow label="Short headline" value={article.short_headline} />
      <FieldRow label="Short resume"   value={article.resume}         divider />
      <FieldRow label="Bottom line"    value={article.bottom_line}    divider />
      <div style={{ borderTop: "1px solid #ebebeb", paddingTop: "10px", marginTop: "10px" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "6px" }}>SARI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "#fafafa", borderRadius: "6px", padding: "10px" }}>
          <SariCell label="Subject"     value={article.sari?.subject     ?? null} />
          <SariCell label="Action"      value={article.sari?.action      ?? null} />
          <SariCell label="Result"      value={article.sari?.result      ?? null} />
          <SariCell label="Implication" value={article.sari?.implication ?? null} />
        </div>
      </div>
      {(dimensions ?? reasoning) && (
        <div style={{ borderTop: "1px solid #ebebeb", paddingTop: "10px", marginTop: "10px" }}>
          {(() => {
            const scored = dimensions ? Object.values(dimensions).filter(v => v !== null).length : 0;
            const total  = dimensions ? Object.keys(dimensions).length : 0;
            return (
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px" }}>
                Prompt assessment · {scored}/{total} applicable
              </div>
            );
          })()}
          {dimensions && Object.entries(dimensions).map(([key, val]) => (
            <DimensionBar key={key} label={key.replace(/_/g, " ")} value={val} />
          ))}
          {reasoning && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#374151", lineHeight: 1.55, borderLeft: "2px solid #e5e7eb", paddingLeft: "10px" }}>
              {reasoning}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value, divider }: { label: string; value: string | null; divider?: boolean }) {
  return (
    <div style={{ borderTop: divider ? "1px solid #ebebeb" : "none", paddingTop: divider ? "10px" : 0, marginTop: divider ? "10px" : 0 }}>
      <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "12px", color: value ? "#1a1a1a" : "#bbb", lineHeight: 1.5, overflowWrap: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

function SariCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "11px", color: value ? "#374151" : "#bbb", lineHeight: 1.4, overflowWrap: "break-word" }}>{value ?? "—"}</div>
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
