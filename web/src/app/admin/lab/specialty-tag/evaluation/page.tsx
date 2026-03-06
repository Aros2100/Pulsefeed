import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

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
  specialty_confidence: number | null;
}

function ArticleRow({ row, article }: { row: DisagreementRow; article: ArticleDetail | undefined }) {
  const title      = article?.title ?? row.article_id ?? "Unknown";
  const journal    = article?.journal_abbr ?? "—";
  const abstract   = article?.abstract;
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
                background: confidence >= 70 ? "#f0fdf4" : confidence >= 40 ? "#fefce8" : "#fef2f2",
                color:      confidence >= 70 ? "#15803d" : confidence >= 40 ? "#d97706" : "#dc2626",
                border:     `1px solid ${confidence >= 70 ? "#bbf7d0" : confidence >= 40 ? "#fde68a" : "#fecaca"}`,
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

export default async function EvaluationPage() {
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

  // All decisions where AI gave a verdict (needed for agreement rate denominator)
  const { data: rawDecisions } = await admin
    .from("lab_decisions")
    .select("article_id, decision, decided_at, ai_decision, ai_confidence, disagreement_reason")
    .eq("specialty", specialty)
    .eq("module", "specialty_tag")
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  const allDecisions = (rawDecisions ?? []) as DisagreementRow[];
  const disagreements = allDecisions.filter((d) => d.decision !== d.ai_decision);

  // Fetch article details only for disagreements (avoids loading all abstracts)
  const articleIds = [...new Set(disagreements.map((d) => d.article_id).filter((id): id is string => id !== null))];
  let articleMap: Record<string, ArticleDetail> = {};

  if (articleIds.length > 0) {
    const { data: articles } = await admin
      .from("articles")
      .select("id, title, journal_abbr, abstract, specialty_confidence")
      .in("id", articleIds);
    articleMap = Object.fromEntries((articles ?? []).map((a) => [a.id, a]));
  }

  // Stats
  const total           = allDecisions.length;
  const totalDisagree   = disagreements.length;
  const agreementRate   = total > 0 ? Math.round(((total - totalDisagree) / total) * 100) : null;

  // False negative: human approved, AI rejected  (prompt too strict)
  const falseNegatives = disagreements.filter((d) => d.decision === "approved" && d.ai_decision === "rejected");
  // False positive: human rejected, AI approved  (prompt too lenient)
  const falsePositives = disagreements.filter((d) => d.decision === "rejected" && d.ai_decision === "approved");

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← The Lab
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Evaluation · Specialty Tag
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            AI/Human Disagreements · {specialtyLabel}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Cases where AI and human decisions differed — use these to refine the prompt
          </p>
        </div>

        {/* Summary stats */}
        <div style={{ ...card, marginBottom: "28px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Summary
            </span>
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
              <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} />
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
              <ArticleRow key={`${row.article_id}-${row.decided_at}`} row={row} article={row.article_id ? articleMap[row.article_id] : undefined} />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
