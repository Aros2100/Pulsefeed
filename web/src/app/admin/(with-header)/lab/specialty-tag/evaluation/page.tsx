import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import VersionSelector from "@/components/lab/VersionSelector";
import PromptDrawer, { type ModelVersion } from "@/components/lab/PromptDrawer";
import FlipVerdictButton from "@/components/lab/FlipVerdictButton";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "16px",
};

function CardHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "11px", letterSpacing: "0.08em", color, textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: "11px", fontWeight: 700, background: color, color: "#fff", borderRadius: "4px", padding: "2px 8px" }}>{count}</span>
    </div>
  );
}

interface DisagreementRow {
  id:                   string;
  article_id:           string | null;
  decision:             string;
  ai_decision:          string | null;
  ai_confidence:        number | null;
  decided_at:           string | null;
  disagreement_reason:  string | null;
  ai_reasoning:         string | null;
}

interface ArticleDetail {
  title:                string;
  journal_abbr:         string | null;
  abstract:             string | null;
  specialty_confidence: number | null;
}

function ArticleRow({ row, article, specialty }: { row: DisagreementRow; article: ArticleDetail | undefined; specialty: string }) {
  const title      = article?.title ?? row.article_id ?? "Unknown";
  const journal    = article?.journal_abbr ?? "—";
  const abstract   = article?.abstract;
  const reasoning  = row.ai_reasoning;
  const confidence = row.ai_confidence ?? article?.specialty_confidence;

  return (
    <div style={{ borderTop: "1px solid #f0f0f0", padding: "14px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link
            href={`/articles/${row.article_id}`}
            style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none", lineHeight: 1.4 }}
          >
            {title}
          </Link>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
            {journal} · {fmtDate(row.decided_at)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {confidence != null && (
              <span style={{
                fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
                background: row.ai_decision === "approved" ? "#f0fdf4" : "#fef2f2",
                color:      row.ai_decision === "approved" ? "#15803d" : "#dc2626",
                border:     `1px solid ${row.ai_decision === "approved" ? "#bbf7d0" : "#fecaca"}`,
              }}>
                AI: {confidence}%
              </span>
            )}
            <span style={{
              fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
              background: row.ai_decision === "approved" ? "#f0fdf4" : "#fef2f2",
              color:      row.ai_decision === "approved" ? "#15803d"  : "#dc2626",
              border:     `1px solid ${row.ai_decision === "approved" ? "#bbf7d0" : "#fecaca"}`,
            }}>
              AI: {row.ai_decision}
            </span>
            <span style={{
              fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
              background: row.decision === "approved" ? "#eff6ff" : "#f5f3ff",
              color:      row.decision === "approved" ? "#1d4ed8"  : "#7c3aed",
              border:     `1px solid ${row.decision === "approved" ? "#bfdbfe" : "#ddd6fe"}`,
            }}>
              Human: {row.decision}
            </span>
          </div>
          {row.disagreement_reason && (
            <span style={{ fontSize: "11px", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "4px", padding: "2px 8px" }}>
              {row.disagreement_reason}
            </span>
          )}
          {row.article_id && (
            <FlipVerdictButton
              decisionId={row.id}
              articleId={row.article_id}
              currentVerdict={row.decision}
              specialty={specialty}
            />
          )}
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

      {reasoning && (
        <details style={{ marginTop: "6px" }}>
          <summary style={{ fontSize: "12px", color: "#7c3aed", cursor: "pointer", userSelect: "none", listStyle: "none" }}>
            ▶ AI reasoning
          </summary>
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#444", lineHeight: 1.6, padding: "10px 12px", background: "#faf9ff", borderRadius: "6px", borderLeft: "3px solid #c4b5fd" }}>
            {reasoning}
          </div>
        </details>
      )}
    </div>
  );
}

interface Props {
  searchParams: Promise<{ version?: string }>;
}

export default async function EvaluationPage({ searchParams }: Props) {
  const { version: versionParam } = await searchParams;

  const specialty = ACTIVE_SPECIALTY;
  const specialtyLabel = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  const admin = createAdminClient();

  // Fetch model versions for selector
  const { data: modelVersionsData } = await admin
    .from("model_versions")
    .select("id, version, prompt_text, notes, activated_at, active, generated_by")
    .eq("specialty", specialty)
    .eq("module", "specialty_tag")
    .order("activated_at", { ascending: false });

  const modelVersions = (modelVersionsData ?? []) as Array<{ version: string; active: boolean }>;
  const activeModelVersion = modelVersions.find((v) => v.active)?.version ?? null;
  const selectedVersion = versionParam ?? activeModelVersion;

  // All decisions where AI gave a verdict (filtered by selected model version)
  const baseQuery = admin
    .from("lab_decisions")
    .select("id, article_id, decision, decided_at, ai_decision, ai_confidence, disagreement_reason, ai_reasoning")
    .eq("specialty", specialty)
    .eq("module", "specialty_tag")
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  const { data: rawDecisions } = selectedVersion
    ? await baseQuery.eq("model_version", selectedVersion)
    : await baseQuery;

  const allDecisions = (rawDecisions ?? []) as unknown as DisagreementRow[];
  const disagreements = allDecisions.filter((d) => d.decision !== d.ai_decision);

  // Fetch article details only for disagreements (avoids loading all abstracts)
  const articleIds = [...new Set(disagreements.map((d) => d.article_id).filter((id): id is string => id !== null))];
  let articleMap: Record<string, ArticleDetail> = {};

  // Fetch article details + all decisions for per-version accuracy in parallel
  const [articlesForMap, allAccRes] = await Promise.all([
    articleIds.length > 0
      ? admin.from("articles")
          .select("id, title, journal_abbr, abstract, specialty_confidence")
          .in("id", articleIds)
      : Promise.resolve({ data: null }),
    admin.from("lab_decisions")
      .select("model_version, ai_decision, decision")
      .eq("specialty", specialty).eq("module", "specialty_tag")
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);
  articleMap = Object.fromEntries(
    (articlesForMap.data ?? []).map((a: Record<string, unknown>) => [a.id, a])
  );

  // Per-version accuracy for PromptSection
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

  // False positives: AI approved, human rejected
  const falsePositivesRaw = allDecisions.filter((d) => d.decision === "rejected" && d.ai_decision === "approved");

  // Stats
  const total           = allDecisions.length;
  const totalDisagree   = disagreements.length;
  const agreementRate   = total > 0 ? Math.round(((total - totalDisagree) / total) * 100) : null;

  // False negative: human approved, AI rejected  (prompt too strict)
  const falseNegatives = disagreements.filter((d) => d.decision === "approved" && d.ai_decision === "rejected");
  // False positive: human rejected, AI approved  (prompt too lenient)
  const falsePositives = disagreements.filter((d) => d.decision === "rejected" && d.ai_decision === "approved");

  // Data sufficiency — based on disagreement count
  const hasSufficientData = totalDisagree >= 0;
  const dataBanner = totalDisagree < 0
    ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Insufficient data — need at least 0 disagreements to identify reliable trends (${totalDisagree} so far)` }
    : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Sufficient data for reliable trend analysis (${totalDisagree} disagreements)` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/specialty-tag" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Speciale-validering
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Evaluation · Specialty Tag
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              AI/Human Disagreements · {specialtyLabel}
            </h1>
            <PromptDrawer
              versions={promptVersions}
              specialty={specialty}
              module="specialty_tag"
              totalDisagreements={totalDisagree}
            />
          </div>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Cases where AI and human decisions differed — use these to refine the prompt
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
              href="/admin/lab/specialty-tag/optimize"
              style={{ flexShrink: 0, fontSize: "13px", fontWeight: 700, background: "#1a1a1a", color: "#fff", borderRadius: "7px", padding: "7px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Optimize model →
            </Link>
          ) : (
            <span
              title="Need at least 0 disagreements first"
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
                Summary
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
              { label: "Total disagreements", value: String(totalDisagree),              color: "#E83B2A" },
              { label: "False negatives",      value: String(falseNegatives.length),     color: "#d97706" },
              { label: "False positives",       value: String(falsePositives.length),    color: "#7c3aed" },
              { label: "Agreement rate",        value: agreementRate != null ? `${agreementRate}%` : "—", color: agreementRate != null && agreementRate >= 80 ? "#15803d" : "#E83B2A" },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid #f0f0f0" : undefined }}>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{kpi.label}</div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* False negatives */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          False Negatives — prompt too strict
        </div>
        <div style={{ ...card, marginBottom: "28px" }}>
          <CardHeader label="Human approved · AI rejected" count={falseNegatives.length} color="#d97706" />
          {falseNegatives.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No false negatives — AI approved everything the human approved</div>
          ) : (
            falseNegatives.map((row) => (
              <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} specialty={specialty} />
            ))
          )}
        </div>

        {/* False positives */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          False Positives — prompt too lenient
        </div>
        <div style={card}>
          <CardHeader label="Human rejected · AI approved" count={falsePositives.length} color="#7c3aed" />
          {falsePositives.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No false positives — AI rejected everything the human rejected</div>
          ) : (
            falsePositives.map((row) => (
              <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} specialty={specialty} />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
