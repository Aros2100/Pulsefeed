import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { BatchDetailClient } from "./BatchDetailClient";

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

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  submitted:   { color: "#6b7280", bg: "#f3f4f6" },
  in_progress: { color: "#d97706", bg: "#fef9c3" },
  ended:       { color: "#1d4ed8", bg: "#dbeafe" },
  ingesting:   { color: "#7c3aed", bg: "#ede9fe" },
  ingested:    { color: "#15803d", bg: "#dcfce7" },
  failed:      { color: "#b91c1c", bg: "#fee2e2" },
  expired:     { color: "#b91c1c", bg: "#fee2e2" },
  cancelled:   { color: "#6b7280", bg: "#f3f4f6" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: "8px 0", fontSize: "12px", color: "#888", width: "160px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "top" }}>{label}</td>
      <td style={{ padding: "8px 0 8px 12px", fontSize: "13px", color: "#1a1a1a", fontFamily: "inherit", wordBreak: "break-all" }}>{value}</td>
    </tr>
  );
}

type BatchRow = {
  id: string;
  anthropic_batch_id: string;
  module: string;
  specialty: string;
  prompt_version: string;
  status: string;
  article_count: number;
  submitted_at: string;
  ended_at: string | null;
  ingested_at: string | null;
  stats: { scored?: number; approved?: number; rejected?: number; failed?: number; failed_ids?: string[] } | null;
  triggered_by: string;
  scoring_run_id: string | null;
  error: string | null;
};

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: row, error } = await admin
    .from("scoring_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) notFound();

  const batch = row as BatchRow;
  const statusStyle = STATUS_STYLE[batch.status] ?? STATUS_STYLE.submitted;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/scoring/batches" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Batches
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Scoring · Batches
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Batch {id.slice(0, 8)}</h1>
            <span style={{ fontSize: "12px", fontWeight: 700, color: statusStyle.color, background: statusStyle.bg, borderRadius: "20px", padding: "2px 10px" }}>
              {batch.status}
            </span>
          </div>
        </div>

        {/* Overview card */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Overview</span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                <MetaRow label="Module"           value={batch.module} />
                <MetaRow label="Specialty"        value={batch.specialty} />
                <MetaRow label="Prompt version"   value={batch.prompt_version} />
                <MetaRow label="Article count"    value={batch.article_count.toLocaleString("en-US")} />
                <MetaRow label="Anthropic batch"  value={<span style={{ fontFamily: "monospace", fontSize: "12px" }}>{batch.anthropic_batch_id}</span>} />
                <MetaRow label="Triggered by"     value={batch.triggered_by} />
                <MetaRow label="Submitted"        value={fmtDate(batch.submitted_at)} />
                <MetaRow label="Ended"            value={fmtDate(batch.ended_at)} />
                <MetaRow label="Ingested"         value={fmtDate(batch.ingested_at)} />
                {batch.error && <MetaRow label="Error" value={<span style={{ color: "#b91c1c" }}>{batch.error}</span>} />}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions + stats (client component) */}
        <BatchDetailClient
          id={id}
          module={batch.module}
          status={batch.status}
          ingestedAt={batch.ingested_at}
          stats={batch.stats}
          articleCount={batch.article_count}
        />

      </div>
    </div>
  );
}
