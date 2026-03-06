import Link from "next/link";

export default function SystemPage() {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#EEF2F7",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>

        <Link href="/admin/system/import" style={{ textDecoration: "none" }}>
          <div style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            padding: "40px 52px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            transition: "box-shadow 0.15s",
            minWidth: "220px",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)")}
          >
            <span style={{ fontSize: "32px" }}>📥</span>
            <span style={{ fontSize: "17px", fontWeight: 700, color: "#1a1a1a" }}>Import</span>
            <span style={{ fontSize: "12px", color: "#888" }}>PubMed import-statistik</span>
          </div>
        </Link>

        <Link href="/admin/system/cost" style={{ textDecoration: "none" }}>
          <div style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            padding: "40px 52px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            transition: "box-shadow 0.15s",
            minWidth: "220px",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)")}
          >
            <span style={{ fontSize: "32px" }}>💰</span>
            <span style={{ fontSize: "17px", fontWeight: 700, color: "#1a1a1a" }}>Cost</span>
            <span style={{ fontSize: "12px", color: "#888" }}>AI API-forbrug</span>
          </div>
        </Link>

      </div>
    </div>
  );
}
