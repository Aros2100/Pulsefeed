import { createClient } from "@/lib/supabase/server";

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
  "#6366f1", // indigo
];

type Row = { article_type: string; n: number };

function DonutChart({ data, total }: { data: Row[]; total: number }) {
  const cx = 60;
  const cy = 60;
  const r = 44;
  const innerR = 28;
  const circumference = 2 * Math.PI * r;

  let cumAngle = -Math.PI / 2;

  const slices = data.map((row, i) => {
    const fraction = row.n / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + fraction * 2 * Math.PI;
    cumAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");

    return { d, color: COLORS[i % COLORS.length] };
  });

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} />
      ))}
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#1a1a1a"
      >
        {total.toLocaleString()}
      </text>
    </svg>
  );
}

export default async function ArticleTypeChart({ specialty }: { specialty: string }) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_article_type_distribution", {
    p_specialty: specialty,
  });

  if (error || !data || data.length === 0) return null;

  const rows = (data as Row[]).map((r) => ({ ...r, n: Number(r.n) }));
  const total = rows.reduce((s, r) => s + r.n, 0);

  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      padding: "20px 24px",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
        textTransform: "uppercase", fontWeight: 700, marginBottom: "16px",
      }}>
        Article type distribution
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <DonutChart data={rows} total={total} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          {rows.map((row, i) => (
            <div key={row.article_type} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "2px", flexShrink: 0,
                background: COLORS[i % COLORS.length],
              }} />
              <div style={{ flex: 1, fontSize: "13px", color: "#1a1a1a", fontWeight: 500 }}>
                {row.article_type}
              </div>
              <div style={{ fontSize: "12px", color: "#888", minWidth: "32px", textAlign: "right" }}>
                {Math.round((row.n / total) * 100)}%
              </div>
              <div style={{ fontSize: "12px", color: "#5a6a85", minWidth: "40px", textAlign: "right" }}>
                {row.n.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
