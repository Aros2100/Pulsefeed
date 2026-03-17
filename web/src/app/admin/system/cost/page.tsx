import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import CostChart from "./CostChart";
import type { TaskData } from "./CostChart";

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekStart(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function fmt$(n: number): string {
  if (n === 0) return "$0,00";
  if (n < 0.01) return "<$0,01";
  return "$" + n.toFixed(2).replace(".", ",");
}

function nFmt(v: number) { return v.toLocaleString("da-DK"); }

// ── Task definitions ──────────────────────────────────────────────────────────

const TASKS = [
  { key: "specialty",      label: "Speciale",       color: "#3B8BD4", model: "Haiku 4.5", modelKeys: ["specialty_tag"],              isGeo: false },
  { key: "classification", label: "Klassificering", color: "#1D9E75", model: "Haiku 4.5", modelKeys: ["classification", "article_type"], isGeo: false },
  { key: "article_type",   label: "Artikel type",   color: "#D85A30", model: "Haiku 4.5", modelKeys: ["article_type"],               isGeo: false },
  { key: "condensation",   label: "Kondensering",   color: "#7F77DD", model: "Haiku 4.5", modelKeys: ["condensation"],               isGeo: false },
  { key: "geo",            label: "Geo",             color: "#888780", model: "Haiku 4.5", modelKeys: ["geo"],                        isGeo: true  },
];

const LAB_KEYS = ["simulate_prompt", "refine_prompt", "pattern_analysis"];

type Row = {
  model_key:    unknown;
  task:         unknown;
  article_id:   unknown;
  cost_usd:     unknown;
  total_tokens: unknown;
  called_at:    unknown;
};

function getTaskKey(row: Row): string | null {
  const taskVal = (row.task as string | null) ?? null;
  if (taskVal) {
    if (TASKS.find((t) => t.key === taskVal)) return taskVal;
  }
  const mk = (row.model_key as string) ?? "";
  // Lab rows don't map to a task via model_key fallback
  if (LAB_KEYS.some((k) => mk.startsWith(k))) return null;
  // Fallback: match by model_key prefix
  for (const t of TASKS) {
    for (const mk2 of t.modelKeys) {
      if (mk === mk2 || mk.startsWith(mk2 + "_")) return t.key;
    }
  }
  return null;
}

type TaskPeriodData = {
  cost: number;
  articles: number;
  calls: number;
  dailySeries: { date: string; cost: number }[];
  labCosts: { simulate: number; refine: number; pattern: number };
};

function computeTaskPeriodData(rows: Row[], taskKey: string): TaskPeriodData {
  const taskRows = rows.filter((r) => getTaskKey(r) === taskKey);

  const cost     = taskRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const articles = new Set(taskRows.filter((r) => r.article_id).map((r) => r.article_id as string)).size;
  const calls    = taskRows.length;

  const byDate: Record<string, number> = {};
  for (const r of taskRows) {
    const date = ((r.called_at as string | null) ?? "").slice(0, 10);
    if (!date) continue;
    byDate[date] = (byDate[date] ?? 0) + Number(r.cost_usd ?? 0);
  }
  const dailySeries = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date, cost: c }));

  // Lab costs: rows tagged with this task key from lab model calls
  const labRows = rows.filter(
    (r) => (r.task as string) === taskKey &&
    LAB_KEYS.some((k) => ((r.model_key as string) ?? "").startsWith(k))
  );
  const simulate = labRows.filter((r) => ((r.model_key as string) ?? "").startsWith("simulate_prompt")).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const refine   = labRows.filter((r) => ((r.model_key as string) ?? "").startsWith("refine_prompt")).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const pattern  = labRows.filter((r) => ((r.model_key as string) ?? "").startsWith("pattern_analysis")).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  return { cost, articles, calls, dailySeries, labCosts: { simulate, refine, pattern } };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CostPage() {
  const admin = createAdminClient();

  const { data: rawRows } = await admin
    .from("api_usage")
    .select("model_key, task, article_id, cost_usd, total_tokens, called_at");

  const allRows = (rawRows ?? []) as unknown as Row[];
  const ws = weekStart();
  const ms = monthStart();

  const weekRows  = allRows.filter((r) => ((r.called_at as string) ?? "") >= ws);
  const monthRows = allRows.filter((r) => ((r.called_at as string) ?? "") >= ms);

  // Build task data for CostChart
  const taskDataList: TaskData[] = TASKS.map((t) => ({
    key:   t.key,
    label: t.label,
    color: t.color,
    model: t.model,
    isGeo: t.isGeo,
    week:  computeTaskPeriodData(weekRows,  t.key),
    month: computeTaskPeriodData(monthRows, t.key),
    all:   computeTaskPeriodData(allRows,   t.key),
  }));

  // Top KPIs
  const sumCost = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const costWeek  = sumCost(weekRows);
  const costMonth = sumCost(monthRows);
  const costAll   = sumCost(allRows);

  const daysElapsed = Math.max(1, new Date().getUTCDate());
  const daysInMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate();
  const estMonthly  = (costMonth / daysElapsed) * daysInMonth;

  const allArticleIds  = new Set(allRows.filter((r) => r.article_id).map((r) => r.article_id as string));
  const totalArticles  = allArticleIds.size;
  const costPerArticle = totalArticles > 0 ? costAll / totalArticles : 0;
  const activeTasks    = TASKS.filter((t) => weekRows.some((r) => getTaskKey(r) === t.key)).length;

  const kpis = [
    { label: "Denne uge",        value: fmt$(costWeek) },
    { label: "Denne måned",      value: fmt$(costMonth) },
    { label: "Est. måned",       value: fmt$(estMonthly) },
    { label: "Total",            value: fmt$(costAll) },
    { label: "Pris pr. artikel", value: fmt$(costPerArticle) },
    { label: "Aktive opgaver",   value: nFmt(activeTasks) },
  ];

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
  };

  const sectionHeader: React.CSSProperties = {
    background: "#EEF2F7",
    borderBottom: "1px solid #dde3ed",
    padding: "10px 20px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#5a6a85",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 20px",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 700,
    color: "#5a6a85",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: "1px solid #dde3ed",
    background: "#f8f9fb",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 20px",
    color: "#1a1a1a",
    borderBottom: "1px solid #f1f3f7",
    fontSize: "13px",
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Cost
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>AI API Cost</h1>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {kpis.map(({ label, value }) => (
            <div key={label} style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "6px" }}>
                {label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Task cards */}
        <CostChart tasks={taskDataList} />

        {/* Model overview */}
        <div style={card}>
          <div style={sectionHeader}>Modeloversigt</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["Funktion", "Model", "Input", "Output"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { fn: "Speciale-validering",  desc: "Vurderer om en artikel tilhører specialet",                      model: "claude-haiku-4-5-20251001",  input: "$1/1M",  output: "$5/1M",  planned: false },
                { fn: "Klassificering",        desc: "Bestemmer subspeciale, artikeltype og studiedesign",             model: "claude-haiku-4-5-20251001",  input: "$1/1M",  output: "$5/1M",  planned: false },
                { fn: "Artikel Type",          desc: "Klassificerer artikeltype via AI",                               model: "claude-haiku-4-5-20251001",  input: "$1/1M",  output: "$5/1M",  planned: false },
                { fn: "Kondensering",          desc: "Genererer overskrift, resumé, bottom line, PICO og sample size", model: "claude-haiku-4-5-20251001",  input: "$1/1M",  output: "$5/1M",  planned: false },
                { fn: "Prompt-simulering",     desc: "Tester ny prompt mod eksisterende data",                         model: "claude-haiku-4-5-20251001",  input: "$1/1M",  output: "$5/1M",  planned: false },
                { fn: "Prompt-refinement",     desc: "Forfiner prompt baseret på ekspert-feedback",                    model: "claude-sonnet-4-6-20260218", input: "$3/1M",  output: "$15/1M", planned: false },
                { fn: "Mønsteranalyse",        desc: "Analyserer fejlmønstre for at forbedre prompts",                 model: "claude-sonnet-4-6-20260218", input: "$3/1M",  output: "$15/1M", planned: false },
                { fn: "Berigelse",             desc: "Genererer resumé, PICO og klinisk relevans (planlagt)",          model: "claude-sonnet-4-6-20260218", input: "$3/1M",  output: "$15/1M", planned: true  },
              ]).map((row) => (
                <tr key={row.fn}>
                  <td style={{ ...tdStyle, fontStyle: row.planned ? "italic" : undefined, color: row.planned ? "#5a6a85" : "#1a1a1a" }}>
                    <div style={{ fontWeight: row.planned ? 400 : 600 }}>{row.fn}</div>
                    <div style={{ fontSize: "11px", color: "#888", fontWeight: 400 }}>{row.desc}</div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", color: row.planned ? "#94a3b8" : "#5a6a85" }}>{row.model}</td>
                  <td style={{ ...tdStyle, color: row.planned ? "#94a3b8" : "#5a6a85" }}>{row.input}</td>
                  <td style={{ ...tdStyle, color: row.planned ? "#94a3b8" : "#5a6a85" }}>{row.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
