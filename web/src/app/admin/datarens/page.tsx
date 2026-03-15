import Link from "next/link";

const items = [
  { href: "/admin/datarens/author-geo", title: "Author Geo", desc: "Validér forfatter-lokationer fra affiliation-parsing" },
  { href: "/admin/datarens/dedub",      title: "Dedub",      desc: "Deduplicering af forfatterposter" },
];

export default function DatarensPage() {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            Datarens
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Moduler</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Geo-validering og deduplicering af forfattere
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "box-shadow 0.15s, border-color 0.15s",
                cursor: "pointer",
              }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>{item.title}</div>
                  <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{item.desc}</p>
                </div>
                <span style={{ fontSize: "18px", color: "#bbb", flexShrink: 0 }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
