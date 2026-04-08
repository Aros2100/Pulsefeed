import AdminArticleListClient from "./AdminArticleListClient";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export default async function AdminArticlesPage() {
  const subspecialties = await getSubspecialties(ACTIVE_SPECIALTY);
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Admin · Artikler
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Artikliste</h1>
        </div>

        <AdminArticleListClient subspecialties={subspecialties} />
      </div>
    </div>
  );
}
