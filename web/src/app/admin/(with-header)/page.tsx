import Link from "next/link";

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const navCards = [
  { href: "/admin/articles",        icon: "📄", title: "Articles",         desc: "Browse and search imported PubMed articles" },
  { href: "/admin/articles/recent", icon: "🆕", title: "Recent articles",  desc: "Filter by publication date, subspeciality and type" },
  { href: "/admin/authors",         icon: "🧑‍🔬", title: "Authors",          desc: "Browse researchers indexed in the database" },
  { href: "/admin/subscribers",     icon: "👥", title: "Subscribers",      desc: "Manage users, statuses, and preferences" },
  { href: "/admin/lab",             icon: "🧪", title: "The Lab",          desc: "Train and improve the AI models" },
  { href: "/admin/system",          icon: "⚙️", title: "System",           desc: "Import configuration and logs" },
];

export default async function AdminDashboard() {
  const weekNumber = getISOWeek(new Date());
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Primary action card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
          marginBottom: "28px",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700 }}>
              Newsletter
            </div>
          </div>
          <Link
            href="/admin/newsletter/select"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 24px", textDecoration: "none", color: "#1a1a1a" }}
          >
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>Select articles · Week {weekNumber}</div>
              <div style={{ fontSize: "13px", color: "#888", marginTop: "5px" }}>Last newsletter: Week 7 · 17 Feb</div>
            </div>
            <div style={{ fontSize: "22px", color: "#ccc", flexShrink: 0 }}>→</div>
          </Link>
        </div>

        {/* Quick access */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          Quick access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
          {navCards.map((card) => (
            <Link key={card.href} href={card.href} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", textDecoration: "none", color: "#1a1a1a" }}>
              <div style={{ fontSize: "22px", marginBottom: "12px" }}>{card.icon}</div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>{card.title}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "4px", lineHeight: 1.4 }}>{card.desc}</div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
