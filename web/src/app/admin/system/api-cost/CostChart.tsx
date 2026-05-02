"use client";
import Link from "next/link";
import { useState } from "react";

type DashRow = {
  task:     string;
  is_lab:   boolean;
  is_batch: boolean;
  lab_step: string | null;
  forbrug:  number;
  artikler: number;
  kald:     number;
};

type Period = "today" | "week" | "month" | "all";

const TASKS = [
  { key: "specialty",      label: "Speciale",     color: "#3B8BD4" },
  { key: "subspecialty",   label: "Subspeciale",  color: "#1D9E75" },
  { key: "article_type",   label: "Artikel type", color: "#D85A30" },
  { key: "condensation_text", label: "Kondensering tekst", color: "#7F77DD" },
  { key: "condensation_sari", label: "Kondensering SARI",  color: "#B077DD" },
  { key: "article_geo_class_a", label: "Geo Class A", color: "#6B9E88", batchOnly: true },
  { key: "article_geo_class_b", label: "Geo Class B", color: "#4A7A6A", batchOnly: true },
  { key: "geo",            label: "Geo",          color: "#888780" },
];

const LAB_STEPS = ["analyse", "prompt-forbedring", "simulering"];

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

function fmt$(n: number, decimals?: number): string {
  if (n === 0) return "$0,00";
  if (n < 0.001) return "<$0,001";
  let effectiveDecimals = decimals;
  if (effectiveDecimals === undefined) {
    if (n < 0.01)  effectiveDecimals = 4;
    else if (n < 1) effectiveDecimals = 3;
    else            effectiveDecimals = 2;
  }
  return "$" + n.toFixed(effectiveDecimals).replace(".", ",");
}

function nFmt(v: number) { return v.toLocaleString("da-DK"); }

function getDrift(rows: DashRow[], taskKey: string) {
  const r = rows.find((r) => r.task === taskKey && !r.is_lab && !r.is_batch);
  return r ?? { forbrug: 0, artikler: 0, kald: 0 };
}

function getBatch(rows: DashRow[], taskKey: string) {
  const r = rows.find((r) => r.task === taskKey && !r.is_lab && r.is_batch);
  return r ?? { forbrug: 0, artikler: 0, kald: 0 };
}

function getLab(rows: DashRow[], taskKey: string, step: string) {
  const r = rows.find((r) => r.task === taskKey && r.is_lab && r.lab_step === step);
  return r?.forbrug ?? 0;
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: SHADOW, overflow: "hidden",
};

const thStyle: React.CSSProperties = {
  padding: "10px 20px", textAlign: "left", fontSize: "11px",
  fontWeight: 700, color: "#5a6a85", textTransform: "uppercase",
  letterSpacing: "0.06em", borderBottom: "1px solid #dde3ed", background: "#f8f9fb",
};

const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const td: React.CSSProperties = { padding: "12px 20px", borderBottom: "1px solid #f1f3f7", fontSize: "13px", color: "#1a1a1a" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdTotal: React.CSSProperties = { ...tdR, fontWeight: 700, background: "#f8f9fb", borderBottom: "none" };
const tdTotalL: React.CSSProperties = { ...td, fontWeight: 700, background: "#f8f9fb", borderBottom: "none" };

export default function CostChart({ today, week, month, all }: {
  today: DashRow[]; week: DashRow[]; month: DashRow[]; all: DashRow[];
}) {
  const [period, setPeriod] = useState<Period>("today");
  const rows = { today, week, month, all }[period];

  const tabs: { key: Period; label: string }[] = [
    { key: "today", label: "I dag"       },
    { key: "week",  label: "Denne uge"   },
    { key: "month", label: "Denne måned" },
    { key: "all",   label: "Alt tid"     },
  ];

  const driftTasks     = TASKS.filter((t) => !t.batchOnly);
  const totalDrift     = driftTasks.reduce((s, t) => s + getDrift(rows, t.key).forbrug, 0);
  const totalLab       = rows.filter((r) => r.is_lab).reduce((s, r) => s + Number(r.forbrug), 0);
  const totalBatch     = TASKS.reduce((s, t) => s + getBatch(rows, t.key).forbrug, 0);
  const totalForbrug   = totalDrift + totalLab + totalBatch;
  const totalArtikler  = driftTasks.reduce((s, t) => s + getDrift(rows, t.key).artikler, 0);
  const prisPerArtikler = totalArtikler > 0 ? totalDrift / totalArtikler : 0;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>← System</Link>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              System · Cost
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>AI API Cost</h1>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setPeriod(t.key)} style={{
                fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "6px",
                border: "1px solid", cursor: "pointer", fontFamily: "inherit",
                borderColor: period === t.key ? "#1a1a1a" : "#dde3ed",
                background:  period === t.key ? "#1a1a1a" : "transparent",
                color:       period === t.key ? "#fff"    : "#5a6a85",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { label: "Drift (manuel)", value: fmt$(totalDrift) },
            { label: "Lab",            value: fmt$(totalLab) },
            { label: "Batch",          value: fmt$(totalBatch) },
            { label: "Total",          value: fmt$(totalForbrug) },
            { label: "Pris/artikel",   value: totalArtikler > 0 ? fmt$(prisPerArtikler, 4) : "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "6px" }}>{label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Drift table */}
        <div style={{ ...card, marginBottom: "20px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>Drift (manuel)</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Task</th>
                <th style={thR}>Total</th>
                <th style={thR}>Artikler</th>
                <th style={thR}>Pris/artikel</th>
                <th style={thR}>Kald</th>
                <th style={thR}>Pris/kald</th>
              </tr>
            </thead>
            <tbody>
              {driftTasks.map((task) => {
                const d = getDrift(rows, task.key);
                const ppa = d.artikler > 0 ? d.forbrug / d.artikler : null;
                const ppk = d.kald > 0     ? d.forbrug / d.kald     : null;
                return (
                  <tr key={task.key}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: task.color }} />
                        <span style={{ fontWeight: 600 }}>{task.label}</span>
                      </div>
                    </td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmt$(Number(d.forbrug))}</td>
                    <td style={tdR}>{d.artikler > 0 ? nFmt(d.artikler) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{ppa ? fmt$(ppa, 4) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{d.kald > 0 ? nFmt(d.kald) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{ppk ? fmt$(ppk, 4) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={tdTotalL}>Total</td>
                <td style={tdTotal}>{fmt$(totalDrift)}</td>
                <td style={tdTotal}>{totalArtikler > 0 ? nFmt(totalArtikler) : ""}</td>
                <td style={tdTotal}>{totalArtikler > 0 ? fmt$(totalDrift / totalArtikler, 4) : ""}</td>
                <td style={tdTotal}>{nFmt(driftTasks.reduce((s, t) => s + getDrift(rows, t.key).kald, 0))}</td>
                <td style={tdTotal}>{driftTasks.reduce((s, t) => s + getDrift(rows, t.key).kald, 0) > 0 ? fmt$(totalDrift / driftTasks.reduce((s, t) => s + getDrift(rows, t.key).kald, 0), 4) : ""}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Batch table */}
        <div style={{ ...card, marginBottom: "20px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>Batch</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Task</th>
                <th style={thR}>Total</th>
                <th style={thR}>Artikler</th>
                <th style={thR}>Pris/artikel</th>
                <th style={thR}>Kald</th>
                <th style={thR}>Pris/kald</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.filter((t) => t.key !== "geo").map((task) => {
                const d = getBatch(rows, task.key);
                const ppa = d.artikler > 0 ? d.forbrug / d.artikler : null;
                const ppk = d.kald > 0     ? d.forbrug / d.kald     : null;
                return (
                  <tr key={task.key}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: task.color }} />
                        <span style={{ fontWeight: 600 }}>{task.label}</span>
                      </div>
                    </td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmt$(Number(d.forbrug))}</td>
                    <td style={tdR}>{d.artikler > 0 ? nFmt(d.artikler) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{ppa ? fmt$(ppa, 4) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{d.kald > 0 ? nFmt(d.kald) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={tdR}>{ppk ? fmt$(ppk, 4) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={tdTotalL}>Total</td>
                <td style={tdTotal}>{fmt$(totalBatch)}</td>
                <td style={tdTotal}>{TASKS.filter(t => t.key !== "geo").reduce((s, t) => s + getBatch(rows, t.key).artikler, 0) > 0 ? nFmt(TASKS.filter(t => t.key !== "geo").reduce((s, t) => s + getBatch(rows, t.key).artikler, 0)) : ""}</td>
                <td style={tdTotal}>{(() => { const a = TASKS.filter(t => t.key !== "geo").reduce((s, t) => s + getBatch(rows, t.key).artikler, 0); return a > 0 ? fmt$(totalBatch / a, 4) : ""; })()}</td>
                <td style={tdTotal}>{nFmt(TASKS.filter(t => t.key !== "geo").reduce((s, t) => s + getBatch(rows, t.key).kald, 0))}</td>
                <td style={tdTotal}>{(() => { const k = TASKS.filter(t => t.key !== "geo").reduce((s, t) => s + getBatch(rows, t.key).kald, 0); return k > 0 ? fmt$(totalBatch / k, 4) : ""; })()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Lab table */}
        <div style={{ ...card, marginBottom: "28px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>Lab</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Task</th>
                <th style={thR}>Total</th>
                <th style={thR}>Analyse</th>
                <th style={thR}>Prompt-forbedring</th>
                <th style={thR}>Simulering</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.filter((t) => t.key !== "geo" && !t.batchOnly).map((task) => {
                const analyse    = getLab(rows, task.key, "analyse");
                const forbedring = getLab(rows, task.key, "prompt-forbedring");
                const simulering = getLab(rows, task.key, "simulering");
                const total      = analyse + forbedring + simulering;
                return (
                  <tr key={task.key}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: task.color }} />
                        <span style={{ fontWeight: 600 }}>{task.label}</span>
                      </div>
                    </td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmt$(total)}</td>
                    <td style={tdR}>{fmt$(analyse)}</td>
                    <td style={tdR}>{fmt$(forbedring)}</td>
                    <td style={tdR}>{fmt$(simulering)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={tdTotalL}>Total</td>
                <td style={tdTotal}>{fmt$(totalLab)}</td>
                <td style={tdTotal}>{fmt$(TASKS.filter(t => t.key !== "geo" && !t.batchOnly).reduce((s, t) => s + getLab(rows, t.key, "analyse"), 0))}</td>
                <td style={tdTotal}>{fmt$(TASKS.filter(t => t.key !== "geo" && !t.batchOnly).reduce((s, t) => s + getLab(rows, t.key, "prompt-forbedring"), 0))}</td>
                <td style={tdTotal}>{fmt$(TASKS.filter(t => t.key !== "geo" && !t.batchOnly).reduce((s, t) => s + getLab(rows, t.key, "simulering"), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
