import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import { SectionCard } from "./SectionCard";
import PromptDrawer, { type ModelVersion } from "@/components/lab/PromptDrawer";

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

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function LabPage() {
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

  // --- Batch 1: base queries ---
  const [queueResult, totalResult, lastResult, versionsResult, allVersionsResult, allDecisionsResult] = await Promise.all([
    admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("lab_decisions")
      .select("*", { count: "exact", head: true })
      .eq("specialty", specialty)
      .eq("module", "specialty_tag"),
    admin
      .from("lab_decisions")
      .select("decided_at")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("decided_at", { ascending: false })
      .limit(1),
    admin
      .from("model_versions")
      .select("version, activated_at")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .eq("active", true)
      .limit(1),
    // All versions (for PromptDrawer)
    admin
      .from("model_versions")
      .select("id, version, prompt_text, notes, activated_at, active, generated_by")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .order("activated_at", { ascending: false }),
    // All decisions (for per-version accuracy in PromptDrawer)
    admin
      .from("lab_decisions")
      .select("model_version, ai_decision, decision")
      .eq("specialty", specialty)
      .eq("module", "specialty_tag")
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);

  const activeVersionName = (versionsResult.data?.[0]?.version as string | null) ?? null;
  const activatedAt = (versionsResult.data?.[0]?.activated_at as string | null) ?? null;

  const noVersion = Promise.resolve({ count: 0 as number | null, error: null });

  // --- Batch 2: version-dependent queries ---
  const [activeVersionCountResult, fpResult, fnResult, decisionsWithAiResult] = await Promise.all([
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
      : noVersion,
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
          .eq("ai_decision", "approved")
          .eq("decision", "rejected")
      : noVersion,
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
          .eq("ai_decision", "rejected")
          .eq("decision", "approved")
      : noVersion,
    activeVersionName
      ? admin
          .from("lab_decisions")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("module", "specialty_tag")
          .eq("model_version", activeVersionName)
          .not("ai_decision", "is", null)
      : noVersion,
  ]);

  const queueCount          = queueResult.count ?? 0;
  const totalDecisions      = totalResult.count ?? 0;
  const lastDecisionAt      = lastResult.data?.[0]?.decided_at ?? null;
  const activeVersionCount  = activeVersionCountResult.count ?? 0;
  const fpCount             = fpResult.count ?? 0;
  const fnCount             = fnResult.count ?? 0;
  const disagreementsCount  = fpCount + fnCount;
  const decisionsWithAi     = decisionsWithAiResult.count ?? 0;
  const agreementCount      = decisionsWithAi - disagreementsCount;
  const agreementRate       = decisionsWithAi > 0
    ? Math.round((agreementCount / decisionsWithAi) * 100)
    : null;

  // --- Build ModelVersion[] for PromptDrawer ---
  const versionAccMap: Record<string, { total: number; correct: number }> = {};
  for (const d of (allDecisionsResult.data ?? [])) {
    const mv = d.model_version as string | null;
    if (!mv) continue;
    if (!versionAccMap[mv]) versionAccMap[mv] = { total: 0, correct: 0 };
    versionAccMap[mv].total++;
    if (d.ai_decision === d.decision) versionAccMap[mv].correct++;
  }
  const rawMV = allVersionsResult.data ?? [];
  const promptVersions: ModelVersion[] = rawMV.map((v, i) => {
    const stats = versionAccMap[v.version as string] ?? { total: 0, correct: 0 };
    return {
      id:             v.id as string,
      version:        v.version as string,
      prompt:         (v.prompt_text as string) ?? "",
      notes:          v.notes as string | null,
      activated_at:   v.activated_at as string,
      deactivated_at: i === 0 ? null : rawMV[i - 1].activated_at as string,
      active:         v.active as boolean,
      accuracy:       stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null,
      validatedCount: stats.total,
      generated_by:   (v.generated_by as string | null) ?? "manual",
    };
  });

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
          <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Specialty Tag Validation
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Mærk artikler og træn AI-modellerne til dit speciale
          </p>
        </div>

        {/* Three section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Card 1: Validering */}
          <SectionCard
            headerLabel="Validering"
            badges={[
              ...(activeVersionName
                ? [{ label: activeVersionName, color: "#dde3ed", textColor: "#5a6a85" }]
                : []),
              { label: "Aktiv", color: "#E83B2A" },
            ]}
            kpis={[
              {
                label: "Artikler i kø",
                value: String(queueCount),
                valueColor: queueCount > 0 ? "#E83B2A" : undefined,
              },
              {
                label: `Bearbejdet, ${activeVersionName ?? "—"}`,
                value: String(activeVersionCount),
                sub: activeVersionCount !== totalDecisions
                  ? `${totalDecisions} i alt`
                  : undefined,
              },
              {
                label: "Uenigheder",
                value: activeVersionCount > 0
                  ? `${Math.round((disagreementsCount / activeVersionCount) * 100)}%`
                  : "—",
                valueColor: disagreementsCount > 0 ? "#d97706" : undefined,
                sub: `${disagreementsCount} af ${activeVersionCount}`,
              },
              {
                label: "Sidst bearbejdet",
                value: fmtDate(lastDecisionAt),
                valueColor: "#5a6a85",
              },
            ]}
            actionLabel={
              queueCount > 0
                ? `Start session · ${queueCount} artikler klar →`
                : "Start session →"
            }
            actionHref={`/admin/system/layers/${specialty}/training`}
            actionColor={queueCount > 0 ? "#E83B2A" : "#1a1a1a"}
          />

          {/* Card 2: Performance */}
          <SectionCard
            headerLabel="Performance"
            badges={
              agreementRate !== null
                ? [{ label: `${agreementRate}% agreement`, color: "#15803d" }]
                : []
            }
            kpis={[
              {
                label: "Nøjagtighed",
                value: agreementRate !== null ? `${agreementRate}%` : "—",
                valueColor: agreementRate !== null ? "#15803d" : undefined,
              },
              {
                label: "Falsk positive",
                value: String(fpCount),
                sub: "AI siger ja, editor nej",
              },
              {
                label: "Falsk negative",
                value: String(fnCount),
                sub: "AI siger nej, editor ja",
              },
              {
                label: "Beslutninger",
                value: String(decisionsWithAi),
                sub: activeVersionName ? `${activeVersionName}-periode` : undefined,
              },
            ]}
            actionLabel="Se detaljer →"
            actionHref="/admin/lab/specialty-tag/dashboard"
          />

          {/* Card 3: Prompt Evaluation */}
          <SectionCard
            headerLabel="Prompt Evaluation"
            badges={[
              ...(activeVersionName
                ? [{ label: activeVersionName, color: "#dde3ed", textColor: "#5a6a85" }]
                : []),
              { label: "Aktiv", color: "#2563eb" },
            ]}
            kpis={[
              {
                label: "Aktiv version",
                value: activeVersionName ?? "—",
              },
              {
                label: "Uenigheder",
                value: String(disagreementsCount),
                valueColor: disagreementsCount > 0 ? "#d97706" : undefined,
                sub: "til analyse",
              },
              {
                label: "Implementeret",
                value: fmtShortDate(activatedAt),
              },
              {
                label: "Agreement rate",
                value: agreementRate !== null ? `${agreementRate}%` : "—",
                valueColor: agreementRate !== null ? "#15803d" : undefined,
                sub: decisionsWithAi > 0
                  ? `${agreementCount} af ${decisionsWithAi}`
                  : undefined,
              },
            ]}
            actionLabel="Start evaluering →"
            actionHref="/admin/lab/specialty-tag/evaluation"
            secondaryAction={
              <PromptDrawer
                versions={promptVersions}
                specialty={specialty}
                module="specialty_tag"
                totalDisagreements={disagreementsCount}
                buttonLabel="Prompt versioner"
              />
            }
          />

        </div>
      </div>
    </div>
  );
}
