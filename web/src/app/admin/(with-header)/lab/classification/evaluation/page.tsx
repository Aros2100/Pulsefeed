import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import VersionSelector from "../../specialty-tag/evaluation/VersionSelector";
import PromptDrawer, { type ModelVersion } from "@/components/lab/PromptDrawer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "16px",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface DisagreementRow {
  article_id:           string | null;
  decision:             string;
  ai_decision:          string | null;
  ai_confidence:        number | null;
  decided_at:           string | null;
  disagreement_reason:  string | null;
}

interface ArticleDetail {
  title:       string;
  journal_abbr: string | null;
  abstract:    string | null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ArticleRow({ row, article }: { row: DisagreementRow; article: ArticleDetail | undefined }) {
  const title   = article?.title ?? row.article_id ?? "Unknown";
  const journal = article?.journal_abbr ?? "—";
  const abstract = article?.abstract;

  return (
    <div style={{ borderTop: "1px solid #f0f0f0", padding: "14px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link
            href={`/admin/articles/${row.article_id}`}
            style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none", lineHeight: 1.4 }}
          >
            {title}
          </Link>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
            {journal} · {fmtDate(row.decided_at)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {row.ai_confidence != null && (
            <span style={{
              fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
              background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0",
            }}>
              {row.ai_confidence}%
            </span>
          )}
          <span style={{
            fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
            background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
          }}>
            AI: {row.ai_decision}
          </span>
          <span style={{ fontSize: "11px", color: "#888" }}>→</span>
          <span style={{
            fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
            background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0",
          }}>
            {row.decision}
          </span>
        </div>
      </div>
      {abstract && (
        <details style={{ marginTop: "8px" }}>
          <summary style={{ fontSize: "12px", color: "#5a6a85", cursor: "pointer", userSelect: "none", listStyle: "none" }}>
            ▶ Show abstract
          </summary>
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#444", lineHeight: 1.6, padding: "10px 12px", background: "#f9fafb", borderRadius: "6px", borderLeft: "3px solid #dde3ed" }}>
            {abstract}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ version?: string }>;
}

export default async function ClassificationEvaluationPage({ searchParams }: Props) {
  const { version: versionParam } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user!.id).single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec =
    SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ??
    SPECIALTIES.find((s) => s.active);
  const specialty      = activeSpec?.slug  ?? "neurosurgery";
  const specialtyLabel = activeSpec?.label ?? "Neurosurgery";

  const admin = createAdminClient();

  // Fetch model versions (module = 'classification')
  const { data: modelVersionsData } = await admin
    .from("model_versions")
    .select("id, version, prompt_text, notes, activated_at, active, generated_by")
    .eq("specialty", specialty)
    .eq("module", "classification")
    .order("activated_at", { ascending: false });

  const modelVersions = (modelVersionsData ?? []) as Array<{ version: string; active: boolean }>;
  const activeModelVersion = modelVersions.find((v) => v.active)?.version ?? null;
  const selectedVersion = versionParam ?? activeModelVersion;

  // Fetch all decisions for subspecialty module + optional version filter
  const baseQuery = admin
    .from("lab_decisions")
    .select("article_id, decision, decided_at, ai_decision, ai_confidence, disagreement_reason")
    .eq("specialty", specialty)
    .eq("module", "classification_subspecialty")
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  const { data: rawDecisions } = selectedVersion
    ? await baseQuery.eq("model_version", selectedVersion)
    : await baseQuery;

  const allDecisions = (rawDecisions ?? []) as DisagreementRow[];
  const disagreements = allDecisions.filter((d) => d.ai_decision !== d.decision);

  // Fetch article details for disagreements
  const articleIds = [...new Set(disagreements.map((d) => d.article_id).filter((id): id is string => id !== null))];

  const [articlesForMap, allAccRes] = await Promise.all([
    articleIds.length > 0
      ? admin.from("articles")
          .select("id, title, journal_abbr, abstract")
          .in("id", articleIds)
      : Promise.resolve({ data: null }),
    // All decisions across versions for per-version accuracy in PromptDrawer
    admin.from("lab_decisions")
      .select("model_version, ai_decision, decision")
      .eq("specialty", specialty)
      .eq("module", "classification_subspecialty")
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);

  const articleMap: Record<string, ArticleDetail> = Object.fromEntries(
    (articlesForMap.data ?? []).map((a: Record<string, unknown>) => [a.id, a])
  );

  // Per-version accuracy for PromptDrawer
  const versionAccMap: Record<string, { total: number; correct: number }> = {};
  for (const d of (allAccRes.data ?? [])) {
    const mv = d.model_version as string | null;
    if (!mv) continue;
    if (!versionAccMap[mv]) versionAccMap[mv] = { total: 0, correct: 0 };
    versionAccMap[mv].total++;
    if (d.ai_decision === d.decision) versionAccMap[mv].correct++;
  }

  const rawMV = modelVersionsData ?? [];
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

  // Stats
  const total          = allDecisions.length;
  const totalDisagree  = disagreements.length;
  const agreementRate  = total > 0 ? Math.round(((total - totalDisagree) / total) * 100) : null;
  const correctedCount = disagreements.filter((d) => d.disagreement_reason === "corrected").length;

  // Data sufficiency
  const hasSufficientData = totalDisagree >= 50;
  const dataBanner = totalDisagree < 50
    ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Utilstrækkelig data — mindst 50 uenigheder nødvendige for pålidelige trends (${totalDisagree} indtil videre)` }
    : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Tilstrækkelig data til pålidelig trendanalyse (${totalDisagree} uenigheder)` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/classification" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Klassificering
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Prompt Evaluation · Classification</span>
            {selectedVersion && (
              <span style={{ fontSize: "11px", fontWeight: 700, background: "#f3f0ff", color: "#7c3aed", borderRadius: "4px", padding: "2px 8px", border: "1px solid #ddd6fe" }}>
                v{selectedVersion}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              AI/Human Disagreements · {specialtyLabel}
            </h1>
            <PromptDrawer
              versions={promptVersions}
              specialty={specialty}
              module="classification"
              totalDisagreements={totalDisagree}
            />
          </div>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Tilfælde hvor AI og human-klassificering afveg — brug disse til at forbedre prompten
          </p>
        </div>

        {/* Data sufficiency banner */}
        <div style={{ background: dataBanner.bg, border: `1px solid ${dataBanner.border}`, borderRadius: "8px", padding: "10px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dataBanner.dot, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: "13px", color: dataBanner.text, fontWeight: 500 }}>{dataBanner.msg}</span>
          </div>
          {hasSufficientData ? (
            <Link
              href="/admin/lab/classification/optimize"
              style={{ flexShrink: 0, fontSize: "13px", fontWeight: 700, background: "#1a1a1a", color: "#fff", borderRadius: "7px", padding: "7px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Optimize model →
            </Link>
          ) : (
            <span
              title="Mindst 50 uenigheder nødvendige"
              style={{ flexShrink: 0, fontSize: "13px", fontWeight: 700, background: "#e2e8f0", color: "#94a3b8", borderRadius: "7px", padding: "7px 16px", whiteSpace: "nowrap", cursor: "not-allowed" }}
            >
              Optimize model →
            </span>
          )}
        </div>

        {/* Summary stats */}
        <div style={{ ...card, marginBottom: "28px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                Summary — Subspecialty
              </span>
              {selectedVersion && (
                <span style={{ fontSize: "11px", color: "#888" }}>
                  {selectedVersion}{selectedVersion === activeModelVersion ? " · aktiv" : ""}
                </span>
              )}
            </div>
            {modelVersions.length > 1 && (
              <VersionSelector versions={modelVersions} selected={selectedVersion} />
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { label: "Uenigheder i alt",     value: String(totalDisagree),    color: "#7c3aed" },
              { label: "Korrigeret af human",   value: String(correctedCount),   color: "#d97706" },
              { label: "Agreement rate",         value: agreementRate != null ? `${agreementRate}%` : "—", color: agreementRate != null && agreementRate >= 80 ? "#15803d" : "#dc2626" },
              { label: "Beslutninger i alt",     value: String(total),            color: "#1a1a1a" },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid #f0f0f0" : undefined }}>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{kpi.label}</div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Disagreements list */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          Korrektioner — Subspecialty
        </div>
        <div style={card}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", fontWeight: 700 }}>
              AI-værdi korrigeret af human
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#7c3aed", color: "#fff", borderRadius: "4px", padding: "2px 8px" }}>
              {disagreements.length}
            </span>
          </div>
          {disagreements.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>
              Ingen uenigheder — AI og human er enige om alle klassificeringer
            </div>
          ) : (
            disagreements.map((row) => (
              <ArticleRow
                key={`${row.article_id}-${row.decided_at}`}
                row={row}
                article={row.article_id ? articleMap[row.article_id] : undefined}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
