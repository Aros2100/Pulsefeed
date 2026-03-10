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
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${(n * 100).toFixed(3)}¢`;
  return `$${n.toFixed(4)}`;
}

function n(v: number) { return v.toLocaleString("da-DK"); }

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CostPage() {
  const admin = createAdminClient();

  const [weekRes, monthRes, allRes] = await Promise.all([
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", weekStart()),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", monthStart()),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd"),
  ]);

  const week  = weekRes.data  ?? [];
  const month = monthRes.data ?? [];
  const all   = allRes.data   ?? [];

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

  // Breakdown by call type — all time
  const byKey: Record<string, { calls: number; tokens: number; cost: number }> = {};
  for (const r of all) {
    const k = (r.model_key as string) ?? "unknown";
    if (!byKey[k]) byKey[k] = { calls: 0, tokens: 0, cost: 0 };
    byKey[k].calls++;
    byKey[k].tokens += (r.total_tokens as number) ?? 0;
    byKey[k].cost   += Number(r.cost_usd ?? 0);
  }
  const byKeyEntries = Object.entries(byKey).sort((a, b) => b[1].cost - a[1].cost);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff", borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
  };

  const kpis = [
    { label: "Denne uge",   value: fmt$(costWeek) },
    { label: "Denne måned", value: fmt$(costMonth) },
    { label: "Est. måned",  value: fmt$(estMonthly) },
    { label: "Total",       value: fmt$(costAll) },
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {kpis.map(({ label, value }) => (
            <div key={label} style={{ ...card, padding: "20px 22px" }}>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                {label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Breakdown by call type */}
        <div style={card}>
          <div style={{
            background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
            padding: "10px 20px", fontSize: "11px", fontWeight: 700,
            letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85",
          }}>
            Fordeling på call type · alt tid
          </div>
          {byKeyEntries.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Ingen API-kald registreret endnu
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f2f5" }}>
                  {["Call type", "Kald", "Tokens", "Pris"].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byKeyEntries.map(([key, v], i) => (
                  <tr key={key} style={{ borderBottom: i < byKeyEntries.length - 1 ? "1px solid #f9f9f9" : undefined }}>
                    <td style={{ padding: "12px 20px", fontFamily: "monospace", color: "#5a6a85" }}>{key}</td>
                    <td style={{ padding: "12px 20px" }}>{n(v.calls)}</td>
                    <td style={{ padding: "12px 20px", color: "#888" }}>{n(v.tokens)}</td>
                    <td style={{ padding: "12px 20px", fontWeight: 600 }}>{fmt$(v.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
