import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SectionCard } from "../SectionCard";

const FIXED_SPECIALTY = "neurosurgery";

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

export default async function ArticleTypeOverviewPage() {
  const admin = createAdminClient();

  // --- Queries ---
  const [
    queueResult,
    totalResult, disagreeResult,
    lastResult,
  ] = await Promise.all([
    // Queue count via RPC
    admin.rpc("count_article_type_not_validated"),

    // Total decisions
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", FIXED_SPECIALTY)
      .eq("module", "article_type")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", FIXED_SPECIALTY)
      .eq("module", "article_type")
      .not("disagreement_reason", "is", null),

    // Last decision
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", FIXED_SPECIALTY)
      .eq("module", "article_type")
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const queueCount      = (queueResult.data as number | null) ?? 0;
  const lastDecisionAt  = lastResult.data?.[0]?.decided_at ?? null;
  const totalDecisions  = totalResult.count ?? 0;
  const totalDisagree   = disagreeResult.count ?? 0;
  const totalReviewed   = totalDecisions;

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
            Artikel Type
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Klassificér artikler i artikel-typer
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
                  ? `${Math.round((totalDisagree / totalDecisions) * 100)}%`
                  : "—",
                valueColor: totalDisagree > 0 ? "#d97706" : undefined,
                sub: `${totalDisagree} af ${totalDecisions} beslutninger`,
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
            actionHref="/admin/lab/article-type/session"
            actionColor="#7c3aed"
          />

          {/* Card 2: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              totalDecisions > 0
                ? [{
                    label: `${Math.round(((totalDecisions - totalDisagree) / totalDecisions) * 100)}% agreement`,
                    color: "#15803d",
                  }]
                : []
            }
            kpis={[
              {
                label: "Artikel Type",
                value: totalDecisions > 0
                  ? `${Math.round(((totalDecisions - totalDisagree) / totalDecisions) * 100)}%`
                  : "—",
                valueColor: totalDecisions > 0 ? "#15803d" : undefined,
                sub: `${totalDecisions - totalDisagree} af ${totalDecisions}`,
              },
              {
                label: "Beslutninger",
                value: String(totalDecisions),
                sub: `${totalReviewed} artikler`,
              },
            ]}
            actionLabel="Se detaljer →"
            actionHref="/admin/lab/article-type/dashboard"
          />

          {/* Card 3: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={totalDisagree > 0 ? [{ label: `${totalDisagree} uenigheder`, color: "#d97706" }] : []}
            kpis={[
              {
                label: "Artikel Type",
                value: String(totalDisagree),
                sub: `af ${totalDecisions} beslutninger`,
              },
              {
                label: "Threshold",
                value: "50",
                sub: "pr. parameter",
              },
            ]}
            actionLabel="Evaluér prompt →"
            actionHref="/admin/lab/article-type/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
