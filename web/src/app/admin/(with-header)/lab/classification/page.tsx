import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
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

const CLS_MODULES = [
  { module: "classification_subspecialty", label: "Subspecialty" },
  { module: "classification_article_type", label: "Article Type" },
  { module: "classification_study_design", label: "Study Design" },
] as const;

export default async function ClassificationOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user!.id)
    .single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec = SPECIALTIES.find(
    (s) => s.active && userSpecialties.includes(s.slug)
  ) ?? SPECIALTIES.find((s) => s.active);

  const specialty = activeSpec?.slug ?? "neurosurgery";

  const admin = createAdminClient();

  // --- Queries ---
  const [
    queueResult,
    // Per-module: total, disagreements, last decision
    subTotalResult, subDisagreeResult,
    typeTotalResult, typeDisagreeResult,
    desTotalResult,  desDisagreeResult,
    lastResult,
  ] = await Promise.all([
    // Queue count via RPC
    admin.rpc("count_classification_not_validated" as never, { p_specialty: specialty } as never),

    // Subspecialty
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_subspecialty")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_subspecialty")
      .eq("disagreement_reason", "corrected"),

    // Article Type
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_article_type")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_article_type")
      .eq("disagreement_reason", "corrected"),

    // Study Design
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_study_design")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "classification_study_design")
      .eq("disagreement_reason", "corrected"),

    // Last decision across all classification modules
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .in("module", CLS_MODULES.map((m) => m.module))
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const queueCount = (queueResult.data as number | null) ?? 0;
  const lastDecisionAt = lastResult.data?.[0]?.decided_at ?? null;

  // Per-module stats
  const moduleStats = [
    { label: "Subspecialty", total: subTotalResult.count ?? 0, disagree: subDisagreeResult.count ?? 0 },
    { label: "Article Type", total: typeTotalResult.count ?? 0, disagree: typeDisagreeResult.count ?? 0 },
    { label: "Study Design", total: desTotalResult.count ?? 0, disagree: desDisagreeResult.count ?? 0 },
  ];

  // Aggregate stats (use subspecialty count as "articles reviewed" since there's 1 per article)
  const totalReviewed = moduleStats[0].total;
  const totalDisagreements = moduleStats.reduce((sum, m) => sum + m.disagree, 0);
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
            color: "#7c3aed",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Klassificering
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Klassificér artikler i sub-specialer, artikeltyper og studiedesign
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: Validering */}
          <SectionCard
            headerLabel="Validering"
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
                sub: "artikler klassificeret",
              },
              {
                label: "Uenigheder",
                value: totalDecisions > 0
                  ? `${Math.round((totalDisagreements / totalDecisions) * 100)}%`
                  : "—",
                valueColor: totalDisagreements > 0 ? "#d97706" : undefined,
                sub: `${totalDisagreements} af ${totalDecisions} felter`,
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
            actionHref="/admin/lab/classification/session"
            actionColor="#7c3aed"
          />

          {/* Card 2: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              totalDecisions > 0
                ? [{
                    label: `${Math.round(((totalDecisions - totalDisagreements) / totalDecisions) * 100)}% agreement`,
                    color: "#15803d",
                  }]
                : []
            }
            kpis={moduleStats.map((m) => {
              const accuracy = m.total > 0
                ? Math.round(((m.total - m.disagree) / m.total) * 100)
                : null;
              return {
                label: m.label,
                value: accuracy !== null ? `${accuracy}%` : "—",
                valueColor: accuracy !== null ? "#15803d" : undefined,
                sub: `${m.total - m.disagree} af ${m.total}`,
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
            actionHref="/admin/lab/classification/dashboard"
          />

          {/* Card 3: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={totalDisagreements > 0 ? [{ label: `${totalDisagreements} uenigheder`, color: "#d97706" }] : []}
            kpis={moduleStats.map((m) => ({
              label: m.label,
              value: String(m.disagree),
              sub: `af ${m.total} beslutninger`,
            })).concat([{
              label: "Threshold",
              value: "50",
              sub: "pr. parameter",
            }])}
            actionLabel="Evaluér prompt →"
            actionHref="/admin/lab/classification/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
