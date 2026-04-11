import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { SectionCard } from "../SectionCard";

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ClassificationOverviewPage() {
  const specialty = ACTIVE_SPECIALTY;

  const admin = createAdminClient();

  // --- Queries ---
  const [
    queueResult,
    subTotalResult, subDisagreeResult,
    lastResult,
  ] = await Promise.all([
    // Queue count via RPC
    admin.rpc("count_classification_not_validated", { p_specialty: specialty }),

    // Subspecialty total decisions
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "subspecialty")
      .not("ai_decision", "is", null),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "subspecialty")
      .eq("disagreement_reason", "corrected"),

    // Last decision
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .eq("module", "subspecialty")
      .order("decided_at", { ascending: false })
      .limit(1),
  ]);

  const queueCount = (queueResult.data as number | null) ?? 0;
  const lastDecisionAt = lastResult.data?.[0]?.decided_at ?? null;

  const totalDecisions = subTotalResult.count ?? 0;
  const totalDisagreements = subDisagreeResult.count ?? 0;
  const totalReviewed = totalDecisions;

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
            Subspeciality
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Classify articles into subspecialities
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: Validation */}
          <SectionCard
            headerLabel="Validation"
            badges={[{ label: "Active", color: "#7c3aed" }]}
            kpis={[
              {
                label: "Articles in queue",
                value: String(queueCount),
                valueColor: queueCount > 0 ? "#7c3aed" : undefined,
              },
              {
                label: "Reviewed",
                value: String(totalReviewed),
                sub: "articles classified",
              },
              {
                label: "Disagreements",
                value: totalDecisions > 0
                  ? `${Math.round((totalDisagreements / totalDecisions) * 100)}%`
                  : "—",
                valueColor: totalDisagreements > 0 ? "#d97706" : undefined,
                sub: `${totalDisagreements} of ${totalDecisions} decisions`,
              },
              {
                label: "Last reviewed",
                value: fmtDate(lastDecisionAt),
                valueColor: "#5a6a85",
              },
            ]}
            actionLabel={
              queueCount > 0
                ? `Start session · ${queueCount} articles →`
                : "Start session →"
            }
            actionHref="/admin/lab/subspecialty/session"
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
            kpis={[
              {
                label: "Subspeciality",
                value: totalDecisions > 0
                  ? `${Math.round(((totalDecisions - totalDisagreements) / totalDecisions) * 100)}%`
                  : "—",
                valueColor: totalDecisions > 0 ? "#15803d" : undefined,
                sub: `${totalDecisions - totalDisagreements} af ${totalDecisions}`,
              },
              {
                label: "Decisions",
                value: String(totalDecisions),
                sub: `${totalReviewed} articles`,
              },
            ]}
            actionLabel="View details →"
            actionHref="/admin/lab/subspecialty/dashboard"
          />

          {/* Card 3: Prompt */}
          <SectionCard
            headerLabel="Prompt"
            badges={totalDisagreements > 0 ? [{ label: `${totalDisagreements} disagreements`, color: "#d97706" }] : []}
            kpis={[
              {
                label: "Subspeciality",
                value: String(totalDisagreements),
                sub: `of ${totalDecisions} decisions`,
              },
              {
                label: "Threshold",
                value: "50",
                sub: "per parameter",
              },
            ]}
            actionLabel="Evaluate prompt →"
            actionHref="/admin/lab/subspecialty/evaluation"
            actionColor="#d97706"
          />

        </div>
      </div>
    </div>
  );
}
