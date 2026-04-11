import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import RecentArticlesClient from "./RecentArticlesClient";

export default async function RecentArticlesPage() {
  const admin = createAdminClient();

  const [subspecialties, specialtiesData] = await Promise.all([
    getSubspecialties(ACTIVE_SPECIALTY),
    admin.from("article_specialties").select("specialty").limit(500),
  ]);

  const specialtySet = new Set<string>(
    (specialtiesData.data ?? []).map((r: { specialty: string }) => r.specialty)
  );
  const specialties = [...specialtySet].sort().map((s) => ({
    value: s,
    label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  if (!specialties.find((s) => s.value === ACTIVE_SPECIALTY)) {
    specialties.unshift({
      value: ACTIVE_SPECIALTY,
      label: ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1),
    });
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Admin · Articles
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Recent Articles</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Browse articles by publication date, subspeciality and article type
          </p>
        </div>

        <RecentArticlesClient subspecialties={subspecialties} specialties={specialties} />
      </div>
    </div>
  );
}
