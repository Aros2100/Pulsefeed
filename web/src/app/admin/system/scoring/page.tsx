import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { ScoringClient } from "./ScoringClient";

export const dynamic = "force-dynamic";

const sectionCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "24px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "#5a6a85",
};

type ModelVersion = { specialty: string; module: string; version: string };

const MODULE_CONFIG: Record<string, {
  label: string;
  apiRoute: string;
  requestBody: (specialty: string) => Record<string, unknown>;
  showLimit?: boolean;
}> = {
  specialty_tag: {
    label: "Specialty",
    apiRoute: "/api/scoring/score-batch",
    requestBody: (specialty) => ({ specialty }),
  },
  subspecialty: {
    label: "Subspecialty",
    apiRoute: "/api/scoring/score-subspecialty",
    requestBody: (specialty) => ({ specialty }),
  },
  article_type: {
    label: "Article Type",
    apiRoute: "/api/lab/score-article-type",
    requestBody: () => ({}),
    showLimit: false,
  },
};

export default async function ScoringPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const specialty = ACTIVE_SPECIALTY;

  const { data: allModules } = await admin
    .from("model_versions")
    .select("specialty, module, version")
    .eq("active", true)
    .in("module", ["specialty_tag", "subspecialty", "article_type"]);

  const rows: ModelVersion[] = allModules ?? [];

  // Fetch pending counts in parallel
  const pendingCounts = await Promise.all(
    rows.map(async ({ module: mod }) => {
      if (mod === "specialty_tag") {
        const { count } = await admin
          .from("article_specialties")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("source", "c2_filter")
          .is("specialty_match", null);
        return [mod, count ?? 0] as const;
      }
      if (mod === "subspecialty") {
        const { data } = await admin.rpc("count_subspecialty_unscored", { p_specialty: specialty });
        return [mod, (data as number | null) ?? 0] as const;
      }
      // article_type
      const { data } = await admin.rpc("count_article_type_unscored");
      return [mod, (data as number | null) ?? 0] as const;
    })
  );
  const pendingByModule = Object.fromEntries(pendingCounts);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Scoring
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Scoring</h1>
        </div>

        {rows.length === 0 && (
          <p style={{ fontSize: "14px", color: "#5a6a85" }}>Ingen aktive scoring-moduler fundet.</p>
        )}

        {rows.map(({ specialty: rowSpecialty, module: mod, version }) => {
          const cfg = MODULE_CONFIG[mod];
          if (!cfg) return null;
          const pending = pendingByModule[mod] ?? 0;
          return (
            <div key={`${rowSpecialty}-${mod}`} style={sectionCard}>
              <div style={sectionHeader}>
                <div>
                  <span style={headerLabel}>{cfg.label}</span>
                  <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                    {rowSpecialty}
                  </span>
                  <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{version}</span>
                </div>
                <span style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: pending > 0 ? "#d97706" : "#15803d",
                  background: pending > 0 ? "#fef9c3" : "#dcfce7",
                  borderRadius: "20px",
                  padding: "2px 10px",
                }}>
                  {pending.toLocaleString("da-DK")} pending
                </span>
              </div>

              <ScoringClient
                specialty={rowSpecialty}
                module={mod}
                version={version}
                pendingCount={pending}
                apiRoute={cfg.apiRoute}
                requestBody={cfg.requestBody(rowSpecialty)}
                showLimit={cfg.showLimit}
              />
            </div>
          );
        })}

      </div>
    </div>
  );
}
