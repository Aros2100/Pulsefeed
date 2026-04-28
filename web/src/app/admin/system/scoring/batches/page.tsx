import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { SubmitBatchForm } from "./SubmitBatchForm";
import { BatchListClient } from "./BatchListClient";

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

export default async function BatchesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const specialty = ACTIVE_SPECIALTY;

  // Pending specialty count — same query as scoring/page.tsx
  const { count: pendingCount } = await admin
    .from("article_specialties")
    .select("*", { count: "exact", head: true })
    .eq("specialty", specialty)
    .eq("source", "c2_filter")
    .is("specialty_match", null);

  // Active prompt version for specialty
  const { data: promptRow } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "specialty")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const promptVersion: string = promptRow?.version ?? "unknown";

  // Pending subspecialty count — same RPC as scoring/page.tsx
  const { data: subPendingRaw } = await admin.rpc("count_subspecialty_unscored", { p_specialty: specialty });
  const subPending: number = (subPendingRaw as number | null) ?? 0;

  // Active prompt version for subspecialty
  const { data: subPromptRow } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "subspecialty")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const subPromptVersion: string = subPromptRow?.version ?? "unknown";

  // Pending article type count
  const { data: atPendingRaw } = await admin.rpc("count_article_type_unscored", { p_specialty: specialty });
  const atPending: number = (atPendingRaw as number | null) ?? 0;

  // Active prompt version for article_type_prod
  const { data: atPromptRow } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "article_type_prod")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const atPromptVersion: string = atPromptRow?.version ?? "unknown";

  // Pending condensation_text count
  const { data: condPendingRaw } = await admin.rpc("count_text_unscored", { p_specialty: specialty });
  const condPending: number = (condPendingRaw as number | null) ?? 0;

  // Active prompt version for condensation_text
  const { data: condPromptRow } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "condensation_text")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const condPromptVersion: string = condPromptRow?.version ?? "unknown";

  // Pending condensation_sari count
  const { data: sariPendingRaw } = await admin.rpc("count_sari_unscored", { p_specialty: specialty });
  const sariPending: number = (sariPendingRaw as number | null) ?? 0;

  // Active prompt version for condensation_sari
  const { data: sariPromptRow } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "condensation_sari")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const sariPromptVersion: string = sariPromptRow?.version ?? "unknown";

  // Recent 20 batches
  const { data: batchRows } = await admin
    .from("scoring_batches")
    .select("id, module, specialty, prompt_version, status, article_count, submitted_at, stats")
    .order("submitted_at", { ascending: false })
    .limit(20);

  const batches = batchRows ?? [];
  const pending = pendingCount ?? 0;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/scoring" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Scoring
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Scoring · Batches
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Batch scoring</h1>
        </div>

        {/* New batch card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <span style={headerLabel}>Specialty batch</span>
              <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                {specialty}
              </span>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{promptVersion}</span>
            </div>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: pending > 0 ? "#d97706" : "#15803d",
              background: pending > 0 ? "#fef9c3" : "#dcfce7",
              borderRadius: "20px", padding: "2px 10px",
            }}>
              {pending.toLocaleString("en-US")} pending
            </span>
          </div>
          <SubmitBatchForm pendingCount={pending} apiRoute="/api/scoring/batch/specialty/submit" />
        </div>

        {/* Subspecialty batch card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <span style={headerLabel}>Subspecialty batch</span>
              <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                {specialty}
              </span>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{subPromptVersion}</span>
            </div>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: subPending > 0 ? "#d97706" : "#15803d",
              background: subPending > 0 ? "#fef9c3" : "#dcfce7",
              borderRadius: "20px", padding: "2px 10px",
            }}>
              {subPending.toLocaleString("en-US")} pending
            </span>
          </div>
          <SubmitBatchForm pendingCount={subPending} apiRoute="/api/scoring/batch/subspecialty/submit" />
        </div>

        {/* Article type batch card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <span style={headerLabel}>Article type batch</span>
              <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                {specialty}
              </span>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{atPromptVersion}</span>
            </div>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: atPending > 0 ? "#d97706" : "#15803d",
              background: atPending > 0 ? "#fef9c3" : "#dcfce7",
              borderRadius: "20px", padding: "2px 10px",
            }}>
              {atPending.toLocaleString("en-US")} pending
            </span>
          </div>
          <SubmitBatchForm pendingCount={atPending} apiRoute="/api/scoring/batch/article-type/submit" />
        </div>

        {/* Condensation text batch card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <span style={headerLabel}>Condensation text batch</span>
              <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                {specialty}
              </span>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{condPromptVersion}</span>
            </div>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: condPending > 0 ? "#d97706" : "#15803d",
              background: condPending > 0 ? "#fef9c3" : "#dcfce7",
              borderRadius: "20px", padding: "2px 10px",
            }}>
              {condPending.toLocaleString("en-US")} pending
            </span>
          </div>
          <SubmitBatchForm pendingCount={condPending} apiRoute="/api/scoring/batch/condensation-text/submit" />
        </div>

        {/* SARI condensation batch card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <span style={headerLabel}>SARI condensation batch</span>
              <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                {specialty}
              </span>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{sariPromptVersion}</span>
            </div>
            <span style={{
              fontSize: "12px", fontWeight: 700,
              color: sariPending > 0 ? "#d97706" : "#15803d",
              background: sariPending > 0 ? "#fef9c3" : "#dcfce7",
              borderRadius: "20px", padding: "2px 10px",
            }}>
              {sariPending.toLocaleString("en-US")} pending
            </span>
          </div>
          <SubmitBatchForm pendingCount={sariPending} apiRoute="/api/scoring/batch/condensation-sari/submit" />
        </div>

        {/* Recent batches card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Recent batches</span>
            <span style={{ fontSize: "12px", color: "#888" }}>Last 20</span>
          </div>
          <BatchListClient initialBatches={batches} />
        </div>

      </div>
    </div>
  );
}
