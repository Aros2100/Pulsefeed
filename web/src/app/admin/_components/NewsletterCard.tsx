import Link from "next/link";

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function NewsletterCard({
  articleCount,
}: {
  articleCount: number;
}) {
  const weekNumber = getISOWeek(new Date());

  return (
    <Link
      href="/admin/newsletter"
      style={{ textDecoration: "none" }}
    >
      <div style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: "10px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "92px",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
      >
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#E83B2A", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
          Newsletter · Week {weekNumber}
        </div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1, marginBottom: "4px" }}>
          {articleCount.toLocaleString("en-US")} articles
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>selection in progress</span>
          <span style={{ fontSize: "12px", color: "#E83B2A", fontWeight: 600 }}>Open →</span>
        </div>
      </div>
    </Link>
  );
}
