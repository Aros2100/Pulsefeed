import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import VersionSelector from "./VersionSelector";
import PromptDrawer, { type ModelVersion } from "@/components/lab/PromptDrawer";

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
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: "16px", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", color, textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, background: color, color: "#fff", borderRadius: "4px", padding: "2px 8px" }}>{count}</span>
      </div>
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: "160px" }}>AI</span>
      <span style={{ fontSize: "10px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: "160px" }}>Human</span>
    </div>
  );
}

interface DisagreementRow {
  article_id:           string | null;
  decision:             string;
  ai_decision:          string | null;
  ai_confidence:        number | null;
  decided_at:           string | null;
  disagreement_reason:  string | null;
}

interface ArticleDetail {
  title:                string;
  journal_abbr:         string | null;
  abstract:             string | null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return [raw]; }
}

function TagBadges({ tags, color, bg, border }: { tags: string[]; color: string; bg: string; border: string }) {
  if (tags.length === 0) return <span style={{ fontSize: "11px", color: "#aaa" }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {tags.map((t, i) => (
        <span key={i} style={{
          fontSize: "11px", fontWeight: 600, borderRadius: "4px", padding: "2px 7px",
          background: bg, color, border: `1px solid ${border}`, whiteSpace: "nowrap",
        }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function ArticleRow({ row, article }: { row: DisagreementRow; article: ArticleDetail | undefined }) {
  const title   = article?.title ?? row.article_id ?? "Unknown";
  const journal = article?.journal_abbr ?? "—";
  const abstract = article?.abstract;

  const aiTags    = parseTags(row.ai_decision);
  const humanTags = parseTags(row.decision);
  const isCorrected = row.decision !== row.ai_decision;

  return (
    <div style={{ borderTop: "1px solid #f0f0f0", padding: "14px 24px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: "16px", alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/articles/${row.article_id}`}
          style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none", lineHeight: 1.4 }}
        >
          {title}
        </Link>
        <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
          {journal} · {fmtDate(row.decided_at)}
          {row.disagreement_reason && (
            <span style={{ marginLeft: "8px", fontSize: "11px", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "4px", padding: "1px 6px" }}>
              {row.disagreement_reason}
            </span>
          )}
        </div>
        {abstract && (
          <details style={{ marginTop: "6px" }}>
            <summary style={{ fontSize: "12px", color: "#5a6a85", cursor: "pointer", userSelect: "none", listStyle: "none" }}>
              ▶ Show abstract
            </summary>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#444", lineHeight: 1.6, padding: "10px 12px", background: "#f9fafb", borderRadius: "6px", borderLeft: "3px solid #dde3ed" }}>
              {abstract}
            </div>
          </details>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
        <TagBadges tags={aiTags} color="#7c3aed" bg="#f5f3ff" border="#ddd6fe" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
        <TagBadges tags={humanTags} color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
      </div>
    </div>
  );
}

interface Props {
  searchParams: Promise<{ version?: string }>;
}

export default async function ClassificationEvaluationPage({ searchParams }: Props) {
  const { version: versionParam } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user!.id)
    .single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec =
    SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ??
    SPECIALTIES.find((s) => s.active);

  const specialty      = activeSpec?.slug  ?? "neurosurgery";
  const specialtyLabel = activeSpec?.label ?? "Neurosurgery";

  const admin = createAdminClient();

  // Fetch model versions for selector
  const { data: modelVersionsData } = await admin
    .from("model_versions")
    .select("id, version, prompt_text, notes, activated_at, active, generated_by")
    .eq("specialty", specialty)
    .eq("module", "classification_subspecialty")
    .order("activated_at", { ascending: false });

  const modelVersions = (modelVersionsData ?? []) as Array<{ version: string; active: boolean }>;
  const activeModelVersion = modelVersions.find((v) => v.active)?.version ?? null;
  const selectedVersion = versionParam ?? activeModelVersion;

  // All decisions where AI gave a verdict (filtered by selected model version)
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
  const disagreements = allDecisions.filter((d) => d.decision !== d.ai_decision);

  // Fetch article details only for disagreements
  const articleIds = [...new Set(disagreements.map((d) => d.article_id).filter((id): id is string => id !== null))];
  let articleMap: Record<string, ArticleDetail> = {};

  const [articlesForMap, allAccRes] = await Promise.all([
    articleIds.length > 0
      ? admin.from("articles")
          .select("id, title, journal_abbr, abstract")
          .in("id", articleIds)
      : Promise.resolve({ data: null }),
    admin.from("lab_decisions")
      .select("model_version, ai_decision, decision")
      .eq("specialty", specialty).eq("module", "classification_subspecialty")
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);
  articleMap = Object.fromEntries(
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
  const total           = allDecisions.length;
  const totalDisagree   = disagreements.length;
  const totalCorrected  = disagreements.filter((d) => d.disagreement_reason === "corrected").length;
  const agreementRate   = total > 0 ? Math.round(((total - totalDisagree) / total) * 100) : null;

  // Data sufficiency
  const hasSufficientData = totalDisagree >= 50;
  const dataBanner = totalDisagree < 50
    ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", text: "#b91c1c", msg: `Insufficient data — need at least 50 disagreements to identify reliable trends (${totalDisagree} so far)` }
    : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `Sufficient data for reliable trend analysis (${totalDisagree} disagreements)` };

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
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Evaluation · Classification
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              AI/Human Disagreements · Subspeciality
            </h1>
            <PromptDrawer
              versions={promptVersions}
              specialty={specialty}
              module="classification_subspecialty"
              totalDisagreements={totalDisagree}
            />
          </div>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Cases where AI and human subspecialty classifications differed — use these to refine the prompt
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
              title="Need at least 100 disagreements first"
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
              { label: "Total decisions",    value: String(total),                color: "#5a6a85" },
              { label: "Corrected",          value: String(totalCorrected),       color: "#d97706" },
              { label: "Corrected rate",     value: total > 0 ? `${Math.round((totalCorrected / total) * 100)}%` : "—", color: "#7c3aed" },
              { label: "Agreement rate",     value: agreementRate != null ? `${agreementRate}%` : "—", color: agreementRate != null && agreementRate >= 80 ? "#15803d" : "#d97706" },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid #f0f0f0" : undefined }}>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{kpi.label}</div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Corrected decisions */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          Corrected — Human changed AI tags
        </div>
        <div style={card}>
          <CardHeader label="AI tags → Human tags" count={totalCorrected} color="#d97706" />
          {totalCorrected === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No corrections — AI matched human on all decisions</div>
          ) : (
            disagreements
              .filter((d) => d.disagreement_reason === "corrected")
              .map((row) => (
                <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} />
              ))
          )}
        </div>

        {/* Other disagreements (if any without "corrected" reason) */}
        {(() => {
          const otherDisagreements = disagreements.filter((d) => d.disagreement_reason !== "corrected");
          if (otherDisagreements.length === 0) return null;
          return (
            <>
              <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
                Other disagreements
              </div>
              <div style={card}>
                <CardHeader label="AI ≠ Human" count={otherDisagreements.length} color="#7c3aed" />
                {otherDisagreements.map((row) => (
                  <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} />
                ))}
              </div>
            </>
          );
        })()}

      </div>
    </div>
  );
}
