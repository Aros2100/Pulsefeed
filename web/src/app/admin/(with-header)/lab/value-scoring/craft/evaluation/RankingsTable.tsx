"use client";

import { useState } from "react";
import Link from "next/link";
import type { RankingsTableRow } from "@/lib/lab/value-scoring/evaluation";

interface Props {
  rows: RankingsTableRow[];
}

interface AugmentedRow extends RankingsTableRow {
  bt110:    number;
  craft110: number;
}

type SortKey = "btRank" | "craftRank" | "diff" | "bt110" | "craft110";

export default function RankingsTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("btRank");
  const [sortAsc, setSortAsc]  = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const btScores = rows.map(r => r.betaScore);
  const btMin    = Math.min(...btScores);
  const btMax    = Math.max(...btScores);
  const btRange  = btMax - btMin;

  const augmented: AugmentedRow[] = rows.map(r => ({
    ...r,
    craft110: 1 + 9 * r.craftScore / 100,
    bt110:    btRange === 0 ? 5 : 2 + 6 * (r.betaScore - btMin) / btRange,
  }));

  const sorted = [...augmented].sort((a, b) => {
    const d = a[sortKey] - b[sortKey];
    return sortAsc ? d : -d;
  });

  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>

      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
          Rankings · {rows.length} articles
        </span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafbfc" }}>
            <th style={thStyle(true, sortKey === "btRank")} onClick={() => handleSort("btRank")}>
              BT rank{sortKey === "btRank" ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
            <th style={thStyle(true, sortKey === "craftRank")} onClick={() => handleSort("craftRank")}>
              Craft rank{sortKey === "craftRank" ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
            <th style={thStyle(true, sortKey === "diff")} onClick={() => handleSort("diff")}>
              Diff{sortKey === "diff" ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
            <th style={{ ...thStyle(false, false), width: "auto" }}>Title</th>
            <th style={thStyle(false, false)}>Article type</th>
            <th style={{ ...thStyle(false, false), textAlign: "right" }}>BT β</th>
            <th style={{ ...thStyle(false, false), textAlign: "right" }}>Craft score</th>
            <th
              style={{ ...thStyle(true, sortKey === "bt110"), textAlign: "right" }}
              onClick={() => handleSort("bt110")}
              title="BT preference on 1-10 scale. Sample min/max mapped to 2-8, reserving 1-2 and 8-10 for articles outside this 100-sample."
            >
              BT 1-10{sortKey === "bt110" ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
            <th
              style={{ ...thStyle(true, sortKey === "craft110"), textAlign: "right" }}
              onClick={() => handleSort("craft110")}
              title="Craft score on 1-10 scale (0-100 mapped to 1-10 linearly)."
            >
              Craft 1-10{sortKey === "craft110" ? (sortAsc ? " ↑" : " ↓") : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.article_id} style={{ borderTop: "1px solid #f5f5f5" }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: "#5a6a85" }}>{r.btRank}</td>
              <td style={{ ...tdStyle, color: "#5a6a85" }}>{r.craftRank}</td>
              <td style={{ ...tdStyle, ...diffCellStyle(r.diff), fontWeight: 600, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {r.diff > 0 ? `+${r.diff}` : r.diff}
              </td>
              <td style={{ ...tdStyle, maxWidth: "280px" }}>
                {r.prod_article_id ? (
                  <Link href={`/admin/articles/${r.prod_article_id}`} style={{ color: "#1a1a1a", textDecoration: "none" }} title={r.title}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </span>
                  </Link>
                ) : (
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1a1a1a" }} title={r.title}>
                    {r.title}
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{r.article_type ?? "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                {r.betaScore.toFixed(2)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                {Number.isInteger(r.craftScore) ? r.craftScore.toFixed(0) : r.craftScore.toFixed(1)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                {Math.round(r.bt110)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                {Math.round(r.craft110)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: "8px 16px", fontSize: "11px", color: "#94a3b8", borderTop: "1px solid #f0f0f0" }}>
        Diff = BT rank − Craft rank ·{" "}
        <span style={{ color: "#1d4ed8" }}>Positive = prompt over-ranks</span>{" "}·{" "}
        <span style={{ color: "#c2410c" }}>Negative = prompt under-ranks</span>
      </div>
    </div>
  );
}

function diffCellStyle(diff: number): React.CSSProperties {
  const abs = Math.abs(diff);
  if (abs <= 5)  return { color: "#5a6a85" };
  if (diff > 0)  return abs <= 15 ? { background: "#dbeafe", color: "#1d4ed8" } : { background: "#93c5fd", color: "#1e40af" };
  return abs <= 15 ? { background: "#ffedd5", color: "#c2410c" } : { background: "#fdba74", color: "#9a3412" };
}

function thStyle(clickable: boolean, active: boolean): React.CSSProperties {
  return {
    textAlign:     "left",
    fontSize:      "11px",
    fontWeight:    600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color:         active ? "#1a1a1a" : "#5a6a85",
    padding:       "10px 16px",
    whiteSpace:    "nowrap",
    cursor:        clickable ? "pointer" : "default",
    userSelect:    "none",
  };
}

const tdStyle: React.CSSProperties = {
  fontSize: "13px",
  padding:  "9px 16px",
};
