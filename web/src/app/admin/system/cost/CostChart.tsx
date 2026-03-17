"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

type TaskPeriodData = {
  cost: number;
  articles: number;
  calls: number;
  dailySeries: { date: string; cost: number }[];
  labCosts: { simulate: number; refine: number; pattern: number };
};

export type TaskData = {
  key: string;
  label: string;
  color: string;
  model: string;
  week:  TaskPeriodData;
  month: TaskPeriodData;
  all:   TaskPeriodData;
  isGeo: boolean;
};

type Period = "week" | "month" | "all";

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

function fmt$(n: number, decimals = 2): string {
  if (n === 0) return "$0,00";
  if (n < 0.001) return "<$0,001";
  return "$" + n.toFixed(decimals).replace(".", ",");
}

function nFmt(v: number) { return v.toLocaleString("da-DK"); }

export default function CostChart({ tasks }: { tasks: TaskData[] }) {
  const [period, setPeriod] = useState<Period>("month");

  const tabs: { key: Period; label: string }[] = [
    { key: "week",  label: "Denne uge"   },
    { key: "month", label: "Denne måned" },
    { key: "all",   label: "Alt tid"     },
  ];

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* Period tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", justifyContent: "flex-end" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPeriod(t.key)}
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: "6px",
              border: "1px solid",
              cursor: "pointer",
              borderColor: period === t.key ? "#1a1a1a" : "#dde3ed",
              background:  period === t.key ? "#1a1a1a" : "transparent",
              color:        period === t.key ? "#fff"    : "#5a6a85",
              fontFamily:  "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Task cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {tasks.map((task) => {
          const data = task[period];
          const costPerArticle = data.articles > 0 ? data.cost / data.articles : 0;
          const maxLabCost = Math.max(data.labCosts.simulate, data.labCosts.refine, data.labCosts.pattern, 0.0001);
          const labEntries = [
            { label: "Simulering",     value: data.labCosts.simulate },
            { label: "Refinement",     value: data.labCosts.refine   },
            { label: "Mønsteranalyse", value: data.labCosts.pattern  },
          ];
          const kpiItems = [
            { label: "Forbrug",      value: fmt$(data.cost, 2) },
            { label: task.isGeo ? "Kald" : "Artikler", value: task.isGeo ? nFmt(data.calls) : nFmt(data.articles) },
            ...(!task.isGeo ? [{ label: "Pris/artikel", value: data.articles > 0 ? fmt$(costPerArticle, 4) : "—" }] : []),
            { label: "Kald", value: nFmt(data.calls) },
          ];

          return (
            <div key={task.key} style={{ background: "#fff", borderRadius: "10px", boxShadow: SHADOW, overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                background: "#EEF2F7",
                borderBottom: "1px solid #dde3ed",
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: task.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>
                    {task.label}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>{task.model}</span>
              </div>

              {/* KPI row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${kpiItems.length}, 1fr)`,
                borderBottom: "1px solid #f1f3f7",
              }}>
                {kpiItems.map((kpi, i) => (
                  <div key={kpi.label} style={{
                    padding: "14px 20px",
                    borderRight: i < kpiItems.length - 1 ? "1px solid #f1f3f7" : "none",
                  }}>
                    <div style={{ fontSize: "10px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>
                      {kpi.label}
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700 }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Content: chart + lab eval */}
              <div style={{ display: "flex" }}>
                {/* Left: daily bar chart */}
                <div style={{ flex: task.isGeo ? 1 : "0 0 58%", padding: "16px 16px 12px" }}>
                  {data.dailySeries.length === 0 ? (
                    <div style={{ height: "100px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#94a3b8" }}>
                      Ingen data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={data.dailySeries} barCategoryGap="30%">
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: string) => {
                            const parts = v.split("-");
                            return `${parts[2]}/${parts[1]}`;
                          }}
                        />
                        <Tooltip
                          cursor={{ fill: "#f1f5f9" }}
                          content={(props) => {
                            const { active, payload, label } = props as unknown as {
                              active?: boolean;
                              payload?: Array<{ value: number }>;
                              label?: string;
                            };
                            if (!active || !payload?.length) return null;
                            return (
                              <div style={{ background: "#fff", border: "1px solid #dde3ed", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                                <div style={{ fontWeight: 700, marginBottom: "4px", color: "#1a1a1a" }}>{label}</div>
                                <div style={{ color: task.color }}>{fmt$(payload[0].value, 4)}</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="cost" fill={task.color} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Right: prompt-evaluering (not for Geo) */}
                {!task.isGeo && (
                  <>
                    <div style={{ width: "1px", background: "#f1f3f7", margin: "12px 0" }} />
                    <div style={{ flex: 1, padding: "16px 20px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "10px" }}>
                        Prompt-evaluering
                      </div>
                      {labEntries.map((entry) => (
                        <div key={entry.label} style={{ marginBottom: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                            <span style={{ color: "#5a6a85" }}>{entry.label}</span>
                            <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{fmt$(entry.value, 2)}</span>
                          </div>
                          <div style={{ height: "4px", background: "#f1f3f7", borderRadius: "2px" }}>
                            <div style={{
                              height: "100%",
                              borderRadius: "2px",
                              background: task.color,
                              width: `${Math.round((entry.value / maxLabCost) * 100)}%`,
                              opacity: 0.7,
                              minWidth: entry.value > 0 ? "3px" : "0",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
