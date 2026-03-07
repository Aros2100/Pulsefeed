import Link from "next/link";
import AdminArticleListClient from "./AdminArticleListClient";

export default async function AdminArticlesPage() {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin" style={{ color: "#5a6a85", textDecoration: "none" }}>← Admin</Link>
        </div>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Admin · Artikler
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Artikliste</h1>
        </div>

        <AdminArticleListClient />
      </div>
    </div>
  );
}
