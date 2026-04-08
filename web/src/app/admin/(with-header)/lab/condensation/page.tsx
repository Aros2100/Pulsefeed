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

const CND_MODULES = [
  { module: "condensation_text", label: "Tekst" },
  { module: "condensation_pico", label: "PICO" },
] as const;

export default async function CondensationOverviewPage() {
  const specialty = ACTIVE_SPECIALTY;

  const admin = createAdminClient();

  // --- Queries ---
  const [
    textQueueResult,
    picoQueueResult,
    textTotalResult, textRejectedResult,
    picoTotalResult, picoRejectedResult,
    lastResult,
  ] = await Promise.all([
    admin.rpc("count_condensation_not_validated", { p_specialty: specialty }),
    admin.rpc("count_pico_not_validated", { p_specialty: specialty }),

    // Tekst
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_text")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_text")
      .eq("decision", "rejected"),

    // PICO
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_pico")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "condensation_pico")
      .eq("decision", "rejected"),

    // Last decision across condensation modules
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .in("module", CND_MODULES.map((m) => m.module))
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const textQueueCount = (textQueueResult.data as number | null) ?? 0;
  const picoQueueCount = (picoQueueResult.data as number | null) ?? 0;
  const lastDecisionAt = lastResult.data?.[0]?.decided_at ?? null;

  // Per-module stats
  const moduleStats = [
    { label: "Tekst", total: textTotalResult.count ?? 0, rejected: textRejectedResult.count ?? 0 },
    { label: "PICO", total: picoTotalResult.count ?? 0, rejected: picoRejectedResult.count ?? 0 },
  ];

  // Aggregate stats
  const totalReviewed = moduleStats[0].total; // 1 text decision per article
  const totalRejections = moduleStats.reduce((sum, m) => sum + m.rejected, 0);
  const totalDecisions = moduleStats.reduce((sum, m) => sum + m.total, 0);

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
            color: "#059669",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Kondensering
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Validér AI-genereret overskrift, resumé, bottom line, PICO og sample size
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: Tekst-validering */}
          <SectionCard
            headerLabel="Tekst-validering"
            badges={[{ label: "Aktiv", color: "#059669" }]}
            kpis={[
              {
                label: "Artikler i kø",
                value: String(textQueueCount),
                valueColor: textQueueCount > 0 ? "#059669" : undefined,
              },
              {
                label: "Bearbejdet",
                value: String(moduleStats[0].total),
                sub: "artikler valideret",
              },
              {
                label: "Afvist",
                value: moduleStats[0].total > 0
                  ? `${Math.round((moduleStats[0].rejected / moduleStats[0].total) * 100)}%`
                  : "—",
                valueColor: moduleStats[0].rejected > 0 ? "#dc2626" : undefined,
                sub: `${moduleStats[0].rejected} af ${moduleStats[0].total}`,
              },
              {
                label: "Sidst bearbejdet",
                value: fmtDate(lastDecisionAt),
                valueColor: "#5a6a85",
              },
            ]}
            actionLabel={
              textQueueCount > 0
                ? `Start session · ${textQueueCount} artikler →`
                : "Start session →"
            }
            actionHref="/admin/lab/condensation/text"
            actionColor="#059669"
          />

          {/* Card 2: PICO-validering */}
          <SectionCard
            headerLabel="PICO-validering"
            badges={[{ label: "Aktiv", color: "#059669" }]}
            kpis={[
              {
                label: "Artikler i kø",
                value: String(picoQueueCount),
                valueColor: picoQueueCount > 0 ? "#059669" : undefined,
              },
              {
                label: "Bearbejdet",
                value: String(moduleStats[1].total),
                sub: "artikler valideret",
              },
              {
                label: "Afvist",
                value: moduleStats[1].total > 0
                  ? `${Math.round((moduleStats[1].rejected / moduleStats[1].total) * 100)}%`
                  : "—",
                valueColor: moduleStats[1].rejected > 0 ? "#dc2626" : undefined,
                sub: `${moduleStats[1].rejected} af ${moduleStats[1].total}`,
              },
              {
                label: "Sidst bearbejdet",
                value: fmtDate(lastDecisionAt),
                valueColor: "#5a6a85",
              },
            ]}
            actionLabel={
              picoQueueCount > 0
                ? `Start session · ${picoQueueCount} artikler →`
                : "Start session →"
            }
            actionHref="/admin/lab/condensation/pico"
            actionColor="#059669"
          />

          {/* Card 3: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              totalDecisions > 0
                ? [{
                    label: `${Math.round(((totalDecisions - totalRejections) / totalDecisions) * 100)}% godkendt`,
                    color: "#15803d",
                  }]
                : []
            }
            kpis={moduleStats.map((m) => {
              const approvalRate = m.total > 0
                ? Math.round(((m.total - m.rejected) / m.total) * 100)
                : null;
              return {
                label: m.label,
                value: approvalRate !== null ? `${approvalRate}%` : "—",
                valueColor: approvalRate !== null ? "#15803d" : undefined,
                sub: `${m.total - m.rejected} af ${m.total}`,
              };
            }).concat([
              {
                label: "Beslutninger",
                value: String(totalDecisions),
                valueColor: undefined,
                sub: `${totalReviewed} artikler`,
              },
            ])}
            actionLabel="Se detaljer →"
            actionHref="/admin/lab/condensation/dashboard"
          />

          {/* Card 4: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={totalRejections > 0 ? [{ label: `${totalRejections} afvisninger`, color: "#d97706" }] : []}
            kpis={moduleStats.map((m) => ({
              label: m.label,
              value: String(m.rejected),
              sub: `af ${m.total} beslutninger`,
            })).concat([{
              label: "Threshold",
              value: "0",
              sub: "altid tilstrækkelig data",
            }])}
            actionLabel="Evaluér prompt →"
            actionHref="/admin/lab/condensation/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
