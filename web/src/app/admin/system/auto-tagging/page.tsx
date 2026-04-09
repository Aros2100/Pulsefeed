import Link from "next/link";

const SHADOW_DEFAULT = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

function Card({ href, emoji, label, sub }: {
  href:  string;
  emoji: string;
  label: string;
  sub:   string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        boxShadow: SHADOW_DEFAULT,
        padding: "40px 52px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        cursor: "pointer",
        minWidth: "220px",
      }}>
        <span style={{ fontSize: "32px" }}>{emoji}</span>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "#1a1a1a" }}>{label}</span>
        <span style={{ fontSize: "12px", color: "#888" }}>{sub}</span>
      </div>
    </Link>
  );
}

export default function AutoTaggingPage() {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#EEF2F7",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "32px",
    }}>
      <div style={{ position: "absolute", top: "24px", left: "24px" }}>
        <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
          ← System
        </Link>
      </div>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>
        <Card href="/admin/system/auto-tagging/tagging"       emoji="🏷️" label="Speciale"     sub="MeSH auto-tagging rules" />
        <Card href="/admin/system/auto-tagging/article-type"  emoji="📄" label="Artikel Type" sub="Deterministisk klassificering" />
      </div>
    </div>
  );
}
