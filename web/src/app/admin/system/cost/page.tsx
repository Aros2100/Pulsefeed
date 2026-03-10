import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

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

function n(v: number) { return v.toLocaleString("da-DK"); }

const FUNCTION_INFO: Record<string, { label: string; description: string }> = {
  specialty_tag:    { label: "Speciale-validering", description: "Vurderer om en artikel tilhører specialet" },
  classification:   { label: "Klassificering",      description: "Bestemmer subspeciale, artikeltype og studiedesign" },
  simulate_prompt:  { label: "Prompt-simulering",   description: "Tester ny prompt mod eksisterende data" },
  pattern_analysis: { label: "Mønsteranalyse",      description: "Analyserer fejlmønstre for at forbedre prompts" },
  condensation:     { label: "Kondensering",          description: "Genererer overskrift, resumé, bottom line, PICO og sample size" },
  enrichment:       { label: "Berigelse",            description: "Genererer resumé, PICO og klinisk relevans" },
};

const FUNCTION_KEYS = Object.keys(FUNCTION_INFO).sort((a, b) => b.length - a.length);

function parseModelKey(raw: string): { key: string; label: string; description: string; version: string | null } {
  for (const fn of FUNCTION_KEYS) {
    const { label, description } = FUNCTION_INFO[fn];
    if (raw === fn) return { key: fn, label, description, version: null };
    if (raw.startsWith(fn + "_")) {
      return { key: fn, label, description, version: raw.slice(fn.length + 1) || null };
    }
  }
  return { key: raw, label: raw, description: "", version: null };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CostPage() {
  const admin = createAdminClient();

  const [weekRes, monthRes, allRes, scoredRes, classifiedRes, condensedRes] = await Promise.all([
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", weekStart()),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", monthStart()),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd"),
    admin.from("articles").select("*", { count: "exact", head: true }).not("specialty_confidence", "is", null),
    admin.from("articles").select("*", { count: "exact", head: true }).not("classification_scored_at", "is", null),
    admin.from("articles").select("*", { count: "exact", head: true }).not("condensed_at", "is", null),
  ]);

  const week  = weekRes.data  ?? [];
  const month = monthRes.data ?? [];
  const all   = allRes.data   ?? [];
  const scoredArticles = scoredRes.count ?? 0;

  const fnArticleCounts: Record<string, number | null> = {
    specialty_tag: scoredRes.count ?? 0,
    classification: classifiedRes.count ?? 0,
    condensation: condensedRes.count ?? 0,
    simulate_prompt: null,
    pattern_analysis: null,
    enrichment: null,
  };

  const sumCost = (rows: { cost_usd: unknown }[]) =>
    rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  const costWeek  = sumCost(week);
  const costMonth = sumCost(month);
  const costAll   = sumCost(all);

  const daysElapsed = Math.max(1, new Date().getUTCDate());
  const daysInMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)
  ).getUTCDate();
  const estMonthly = (costMonth / daysElapsed) * daysInMonth;

  // Breakdown by function — all time, aggregated by parsed function key
  const byFn: Record<string, { key: string; label: string; description: string; calls: number; tokens: number; cost: number }> = {};
  for (const r of all) {
    const k = (r.model_key as string) ?? "unknown";
    const { key: fnKey, label, description } = parseModelKey(k);
    if (!byFn[fnKey]) byFn[fnKey] = { key: fnKey, label, description, calls: 0, tokens: 0, cost: 0 };
    byFn[fnKey].calls++;
    byFn[fnKey].tokens += (r.total_tokens as number) ?? 0;
    byFn[fnKey].cost   += Number(r.cost_usd ?? 0);
  }
  const byFnEntries = Object.values(byFn).sort((a, b) => b.cost - a.cost);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff", borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
  };

  const sectionHeader: React.CSSProperties = {
    background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
    padding: "10px 20px", fontSize: "11px", fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 20px", textAlign: "left", fontSize: "11px",
    fontWeight: 700, color: "#5a6a85", textTransform: "uppercase",
    letterSpacing: "0.06em", borderBottom: "1px solid #dde3ed",
    background: "#f8f9fb",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 20px", color: "#1a1a1a",
    borderBottom: "1px solid #f1f3f7", fontSize: "13px",
  };

  const totalCalls  = all.length;
  const totalTokens = all.reduce((s, r) => s + ((r.total_tokens as number) ?? 0), 0);
  const costPerArticle = costAll / (scoredArticles || 1);
  const tokensPerCall  = totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0;

  const kpis = [
    { label: "Denne uge",             value: fmt$(costWeek) },
    { label: "Denne måned",           value: fmt$(costMonth) },
    { label: "Est. måned",            value: fmt$(estMonthly) },
    { label: "Total",                 value: fmt$(costAll) },
    { label: "Pris pr. artikel",      value: fmt$(costPerArticle) },
    { label: "Gns. tokens pr. kald",  value: n(tokensPerCall) },
  ];

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

        {/* Breakdown by call type */}
        <div style={{ ...card, marginBottom: "28px" }}>
          <div style={sectionHeader}>
            Fordeling p&aring; call type &middot; alt tid
          </div>
          {byFnEntries.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#5a6a85" }}>
              Ingen API-kald registreret endnu
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Funktion", "Artikler", "Kald", "Tokens", "Pris", "Pris/artikel"].map((h) => (
                    <th key={h} style={{ ...thStyle, ...(h === "Pris" || h === "Pris/artikel" ? { textAlign: "right" } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byFnEntries.map((v) => {
                  const ac = fnArticleCounts[v.key] ?? null;
                  return (
                    <tr key={v.key} style={{ borderBottom: "1px solid #f1f3f7" }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{v.label}</div>
                        {v.description && <div style={{ fontSize: "11px", color: "#888", fontWeight: 400 }}>{v.description}</div>}
                      </td>
                      <td style={tdStyle}>{ac != null ? n(ac) : "—"}</td>
                      <td style={tdStyle}>{n(v.calls)}</td>
                      <td style={{ ...tdStyle, color: "#5a6a85" }}>{n(v.tokens)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, textAlign: "right" }}>{fmt$(v.cost)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#5a6a85" }}>{ac ? fmt$(v.cost / ac) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Model info */}
        <div style={card}>
          <div style={sectionHeader}>
            Modeloversigt
          </div>
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
                { fn: "Speciale-validering", desc: "Vurderer om en artikel tilhører specialet",              model: "claude-haiku",  input: "$0.25/1M", output: "$1.25/1M", planned: false },
                { fn: "Klassificering",      desc: "Bestemmer subspeciale, artikeltype og studiedesign",                    model: "claude-haiku",  input: "$0.25/1M", output: "$1.25/1M", planned: false },
                { fn: "Kondensering",        desc: "Genererer overskrift, resumé, bottom line, PICO og sample size", model: "claude-haiku",  input: "$0.25/1M", output: "$1.25/1M", planned: false },
                { fn: "Prompt-simulering",   desc: "Tester ny prompt mod eksisterende data",                         model: "claude-haiku",  input: "$0.25/1M", output: "$1.25/1M", planned: false },
                { fn: "Mønsteranalyse",      desc: "Analyserer fejlmønstre for at forbedre prompts",       model: "claude-sonnet", input: "$3/1M",    output: "$15/1M",   planned: false },
                { fn: "Berigelse",           desc: "Genererer resumé, PICO og klinisk relevans (planlagt)", model: "claude-sonnet", input: "$3/1M",    output: "$15/1M",   planned: true },
              ]).map((row) => (
                <tr key={row.fn} style={{ borderBottom: "1px solid #f1f3f7" }}>
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
