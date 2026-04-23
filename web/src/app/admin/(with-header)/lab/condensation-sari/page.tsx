import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { SectionCard } from "../SectionCard";

function fmtDate(iso: string | null): string {
  if (!iso) return "Aldrig";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CondensationSariOverviewPage() {
  const specialty = ACTIVE_SPECIALTY;
  const admin = createAdminClient();

  const [
    queueResult,
    totalResult,
    rejectedResult,
    lastResult,
  ] = await Promise.all([
    admin.rpc("count_sari_not_validated", { p_specialty: specialty }),

    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_sari")
      .not("ai_decision", "is", null),

    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_sari")
      .eq("decision", "rejected"),

    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .eq("module", "condensation_sari")
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const queueCount      = (queueResult.data as number | null) ?? 0;
  const totalReviewed   = totalResult.count ?? 0;
  const totalRejected   = rejectedResult.count ?? 0;
  const lastDecisionAt  = lastResult.data?.[0]?.decided_at ?? null;
  const approvalRate    = totalReviewed > 0
    ? Math.round(((totalReviewed - totalRejected) / totalReviewed) * 100)
    : null;

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back link */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← The Lab
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#7c3aed",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            SARI Condensation
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Validate AI-generated subject, action, result and implication
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: SARI-validering */}
          <SectionCard
            headerLabel="SARI-validering"
            badges={[{ label: "Aktiv", color: "#7c3aed" }]}
            kpis={[
              {
                label: "Artikler i kø",
                value: String(queueCount),
                valueColor: queueCount > 0 ? "#7c3aed" : undefined,
              },
              {
                label: "Bearbejdet",
                value: String(totalReviewed),
                sub: "artikler valideret",
              },
              {
                label: "Afvist",
                value: totalReviewed > 0
                  ? `${Math.round((totalRejected / totalReviewed) * 100)}%`
                  : "—",
                valueColor: totalRejected > 0 ? "#dc2626" : undefined,
                sub: `${totalRejected} af ${totalReviewed}`,
              },
              {
                label: "Sidst bearbejdet",
                value: fmtDate(lastDecisionAt),
                valueColor: "#5a6a85",
              },
            ]}
            actionLabel={
              queueCount > 0
                ? `Start session · ${queueCount} artikler →`
                : "Start session →"
            }
            actionHref="/admin/lab/condensation-sari/session"
            actionColor="#7c3aed"
          />

          {/* Card 2: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              approvalRate !== null
                ? [{ label: `${approvalRate}% godkendt`, color: "#15803d" }]
                : []
            }
            kpis={[
              {
                label: "Godkendelsesrate",
                value: approvalRate !== null ? `${approvalRate}%` : "—",
                valueColor: approvalRate !== null ? "#15803d" : undefined,
                sub: `${totalReviewed - totalRejected} af ${totalReviewed}`,
              },
              {
                label: "Afvisninger",
                value: String(totalRejected),
                valueColor: totalRejected > 0 ? "#dc2626" : undefined,
              },
              {
                label: "Beslutninger",
                value: String(totalReviewed),
              },
            ]}
            actionLabel="Se detaljer →"
            actionHref="/admin/lab/condensation-sari/dashboard"
          />

          {/* Card 3: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={totalRejected > 0 ? [{ label: `${totalRejected} afvisninger`, color: "#d97706" }] : []}
            kpis={[
              {
                label: "Afvisninger",
                value: String(totalRejected),
                sub: `af ${totalReviewed} beslutninger`,
              },
              {
                label: "Threshold",
                value: "0",
                sub: "altid tilstrækkelig data",
              },
            ]}
            actionLabel="Evaluér prompt →"
            actionHref="/admin/lab/condensation-sari/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
