import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import VersionSelector from "@/components/lab/VersionSelector";
import PromptDrawer, { type ModelVersion } from "@/components/lab/PromptDrawer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "text", label: "Tekst", module: "condensation_text" },
  { key: "pico", label: "PICO",  module: "condensation_pico" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ─── Styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "16px",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface RejectionRow {
  article_id:           string | null;
  decision:             string;
  ai_decision:          string | null;
  ai_confidence:        number | null;
  decided_at:           string | null;
  disagreement_reason:  string | null;
  reject_reasons:       string[] | null;
  comment:              string | null;
}

interface ArticleDetail {
  title:          string;
  journal_abbr:   string | null;
  abstract:       string | null;
  short_headline: string | null;
  short_resume:   string | null;
  bottom_line:    string | null;
  pico_population:   string | null;
  pico_intervention: string | null;
  pico_comparison:   string | null;
  pico_outcome:      string | null;
  sample_size:       number | null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ArticleRow({ row, article, tab }: { row: RejectionRow; article: ArticleDetail | undefined; tab: TabKey }) {
  const title    = article?.title ?? row.article_id ?? "Unknown";
  const journal  = article?.journal_abbr ?? "—";
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
        {row.disagreement_reason && row.disagreement_reason !== "rejected" && (
          <span style={{
            fontSize: "11px", fontWeight: 600, borderRadius: "4px", padding: "2px 7px",
            background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
            flexShrink: 0, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {row.disagreement_reason}
          </span>
        )}
      </div>

      {row.decision === "rejected" && (row.reject_reasons?.length || row.comment) && (
        <div style={{ marginTop: "8px", fontSize: "12px", color: "#444" }}>
          {row.reject_reasons && row.reject_reasons.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: row.comment ? "6px" : 0 }}>
              {row.reject_reasons.map((r) => (
                <span key={r} style={{
                  fontSize: "11px", fontWeight: 600, borderRadius: "4px", padding: "2px 7px",
                  background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
                }}>
                  {r}
                </span>
              ))}
            </div>
          )}
          {row.comment && (
            <div style={{ fontSize: "12px", color: "#555", fontStyle: "italic", lineHeight: 1.5 }}>
              {row.comment}
            </div>
          )}
        </div>
      )}

      {/* Show rejected condensation content */}
      {article && tab === "text" && (article.short_headline || article.short_resume || article.bottom_line) && (
        <div style={{ marginTop: "10px", padding: "10px 12px", background: "#fef2f2", borderRadius: "6px", borderLeft: "3px solid #fecaca" }}>
          {article.short_headline && (
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" }}>{article.short_headline}</div>
          )}
          {article.short_resume && (
            <div style={{ fontSize: "12px", color: "#444", lineHeight: 1.5, marginBottom: article.bottom_line ? "6px" : 0 }}>{article.short_resume}</div>
          )}
          {article.bottom_line && (
            <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic", lineHeight: 1.4 }}>{article.bottom_line}</div>
          )}
        </div>
      )}

      {article && tab === "pico" && (article.pico_population || article.pico_intervention || article.pico_comparison || article.pico_outcome) && (
        <div style={{ marginTop: "10px", padding: "10px 12px", background: "#fef2f2", borderRadius: "6px", borderLeft: "3px solid #fecaca", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {[
            { label: "P", value: article.pico_population },
            { label: "I", value: article.pico_intervention },
            { label: "C", value: article.pico_comparison },
            { label: "O", value: article.pico_outcome },
          ].filter((p) => p.value).map((p) => (
            <div key={p.label}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#888" }}>{p.label}: </span>
              <span style={{ fontSize: "12px", color: "#444" }}>{p.value}</span>
            </div>
          ))}
          {article.sample_size != null && (
            <div>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#888" }}>N: </span>
              <span style={{ fontSize: "12px", color: "#444" }}>{article.sample_size}</span>
            </div>
          )}
        </div>
      )}

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
  searchParams: Promise<{ tab?: string; version?: string }>;
}

export default async function CondensationEvaluationPage({ searchParams }: Props) {
  const { tab: tabParam, version: versionParam } = await searchParams;
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "text";
  const activeModule = TABS.find((t) => t.key === activeTab)!.module;

  const specialty = ACTIVE_SPECIALTY;
  const specialtyLabel = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  const admin = createAdminClient();

  // Fetch model versions (module = 'condensation')
  const { data: modelVersionsData } = await admin
    .from("model_versions")
    .select("id, version, prompt_text, notes, activated_at, active, generated_by")
    .eq("specialty", specialty)
    .eq("module", "condensation")
    .order("activated_at", { ascending: false });

  const modelVersions = (modelVersionsData ?? []) as Array<{ version: string; active: boolean }>;
  const activeModelVersion = modelVersions.find((v) => v.active)?.version ?? null;
  const selectedVersion = versionParam ?? activeModelVersion;

  // Fetch decisions for selected module + optional version filter
  const baseQuery = admin
    .from("lab_decisions")
    .select("article_id, decision, decided_at, ai_decision, ai_confidence, disagreement_reason, reject_reasons, comment")
    .eq("specialty", specialty)
    .eq("module", activeModule)
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  const { data: rawDecisions } = selectedVersion
    ? await baseQuery.eq("model_version", selectedVersion)
    : await baseQuery;

  const allDecisions = (rawDecisions ?? []) as RejectionRow[];
  const rejections = allDecisions.filter((d) => d.decision === "rejected");

  // Fetch article details for rejections
  const articleIds = [...new Set(rejections.map((d) => d.article_id).filter((id): id is string => id !== null))];

  const [articlesForMap, allAccRes] = await Promise.all([
    articleIds.length > 0
      ? admin.from("articles")
          .select("id, title, journal_abbr, abstract, short_headline, short_resume, bottom_line, pico_population, pico_intervention, pico_comparison, pico_outcome, sample_size")
          .in("id", articleIds)
      : Promise.resolve({ data: null }),
    admin.from("lab_decisions")
      .select("model_version, ai_decision, decision")
      .eq("specialty", specialty)
      .eq("module", activeModule)
      .not("ai_decision", "is", null)
      .limit(10000),
  ]);

  const articleMap: Record<string, ArticleDetail> = Object.fromEntries(
    ((articlesForMap.data ?? []) as unknown as (ArticleDetail & { id: string })[]).map((a) => [a.id, a])
  );

  // Per-version accuracy for PromptDrawer
  const versionAccMap: Record<string, { total: number; correct: number }> = {};
  for (const d of (allAccRes.data ?? [])) {
    const mv = d.model_version as string | null;
    if (!mv) continue;
    if (!versionAccMap[mv]) versionAccMap[mv] = { total: 0, correct: 0 };
    versionAccMap[mv].total++;
    if (d.decision === "approved") versionAccMap[mv].correct++;
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
  const total         = allDecisions.length;
  const totalRejected = rejections.length;
  const approvalRate  = total > 0 ? Math.round(((total - totalRejected) / total) * 100) : null;

  // Data sufficiency
  const hasSufficientData = true;
  const dataBanner = { bg: "#f0fdf4", border: "#bbf7d0", dot: "#15803d", text: "#14532d", msg: `${totalRejected} afvisninger` };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/condensation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Kondensering
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#059669", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Prompt Evaluation · Condensation</span>
            {selectedVersion && (
              <span style={{ fontSize: "11px", fontWeight: 700, background: "#ecfdf5", color: "#059669", borderRadius: "4px", padding: "2px 8px", border: "1px solid #a7f3d0" }}>
                v{selectedVersion}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              Afvisninger · {specialtyLabel}
            </h1>
            <PromptDrawer
              versions={promptVersions}
              specialty={specialty}
              module="condensation"
              totalDisagreements={totalRejected}
            />
          </div>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Tilfælde hvor AI-genereret indhold blev afvist — brug disse til at forbedre prompten
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
          {TABS.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <Link
                key={t.key}
                href={`/admin/lab/condensation/evaluation?tab=${t.key}${selectedVersion ? `&version=${selectedVersion}` : ""}`}
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#059669" : "#5a6a85",
                  background: isActive ? "#ecfdf5" : "#fff",
                  border: `1px solid ${isActive ? "#a7f3d0" : "#e5e7eb"}`,
                  borderRadius: "6px",
                  padding: "7px 16px",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Data sufficiency banner */}
        <div style={{ background: dataBanner.bg, border: `1px solid ${dataBanner.border}`, borderRadius: "8px", padding: "10px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dataBanner.dot, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: "13px", color: dataBanner.text, fontWeight: 500 }}>{dataBanner.msg}</span>
          </div>
          <Link
            href="/admin/lab/condensation/optimize"
            style={{ flexShrink: 0, fontSize: "13px", fontWeight: 700, background: "#059669", color: "#fff", borderRadius: "7px", padding: "7px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Optimér prompt →
          </Link>
        </div>

        {/* Summary stats */}
        <div style={{ ...card, marginBottom: "28px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                Summary — {TABS.find((t) => t.key === activeTab)!.label}
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
              { label: "Afvisninger i alt",      value: String(totalRejected),    color: "#dc2626" },
              { label: "Godkendt",                value: String(total - totalRejected), color: "#15803d" },
              { label: "Godkendelsesrate",        value: approvalRate != null ? `${approvalRate}%` : "—", color: approvalRate != null && approvalRate >= 80 ? "#15803d" : "#dc2626" },
              { label: "Beslutninger i alt",      value: String(total),            color: "#1a1a1a" },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid #f0f0f0" : undefined }}>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{kpi.label}</div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rejections list */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          Afvisninger — {TABS.find((t) => t.key === activeTab)!.label}
        </div>
        <div style={card}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#dc2626", textTransform: "uppercase", fontWeight: 700 }}>
              Afvist AI-indhold
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#dc2626", color: "#fff", borderRadius: "4px", padding: "2px 8px" }}>
              {rejections.length}
            </span>
          </div>
          {rejections.length === 0 ? (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>
              Ingen afvisninger — alt AI-genereret indhold er godkendt
            </div>
          ) : (
            rejections.map((row) => (
              <ArticleRow
                key={`${row.article_id}-${row.decided_at}`}
                row={row}
                article={row.article_id ? articleMap[row.article_id] : undefined}
                tab={activeTab}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
