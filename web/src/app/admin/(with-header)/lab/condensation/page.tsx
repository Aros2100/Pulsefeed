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

export default async function CondensationOverviewPage() {
  const specialty = ACTIVE_SPECIALTY;

  const admin = createAdminClient();

  // --- Queries ---
  const [
    picoQueueResult,
    sariTotalResult, sariRejectedResult,
    lastResult,
  ] = await Promise.all([
    admin.rpc("count_pico_not_validated", { p_specialty: specialty }),

    // SARI
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

    // Last SARI decision
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .eq("module", "condensation_sari")
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const picoQueueCount  = (picoQueueResult.data as number | null) ?? 0;
  const sariTotal       = sariTotalResult.count ?? 0;
  const sariRejected    = sariRejectedResult.count ?? 0;
  const lastDecisionAt  = lastResult.data?.[0]?.decided_at ?? null;

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
            Validér AI-genereret overskrift, resumé, bottom line, SARI og sample size
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: SARI-validering */}
          <SectionCard
            headerLabel="SARI-validering"
            badges={[{ label: "Aktiv", color: "#059669" }]}
            kpis={[
              {
                label: "Artikler i kø",
                value: String(picoQueueCount),
                valueColor: picoQueueCount > 0 ? "#059669" : undefined,
              },
              {
                label: "Bearbejdet",
                value: String(sariTotal),
                sub: "artikler valideret",
              },
              {
                label: "Afvist",
                value: sariTotal > 0
                  ? `${Math.round((sariRejected / sariTotal) * 100)}%`
                  : "—",
                valueColor: sariRejected > 0 ? "#dc2626" : undefined,
                sub: `${sariRejected} af ${sariTotal}`,
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
            actionHref="/admin/lab/condensation/sari"
            actionColor="#059669"
          />

          {/* Card 2: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              sariTotal > 0
                ? [{
                    label: `${Math.round(((sariTotal - sariRejected) / sariTotal) * 100)}% godkendt`,
                    color: "#15803d",
                  }]
                : []
            }
            kpis={[
              {
                label: "SARI",
                value: sariTotal > 0 ? `${Math.round(((sariTotal - sariRejected) / sariTotal) * 100)}%` : "—",
                valueColor: sariTotal > 0 ? "#15803d" : undefined,
                sub: `${sariTotal - sariRejected} af ${sariTotal}`,
              },
              {
                label: "Beslutninger",
                value: String(sariTotal),
                valueColor: undefined,
                sub: "artikler",
              },
            ]}
            actionLabel="Se detaljer →"
            actionHref="/admin/lab/condensation/dashboard"
          />

          {/* Card 3: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={sariRejected > 0 ? [{ label: `${sariRejected} afvisninger`, color: "#d97706" }] : []}
            kpis={[
              {
                label: "SARI",
                value: String(sariRejected),
                sub: `af ${sariTotal} beslutninger`,
              },
              {
                label: "Threshold",
                value: "0",
                sub: "altid tilstrækkelig data",
              },
            ]}
            actionLabel="Evaluér prompt →"
            actionHref="/admin/lab/condensation/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
