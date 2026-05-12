import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPromptVersion,
  getQuickResults,
  type QuickResultRow,
} from "@/lib/lab/value-scoring/prompt-versions";
import { spearman } from "@/lib/lab/value-scoring/evaluation";
import PromptDetailClient from "./PromptDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PromptVersionDetailPage({ params }: PageProps) {
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const version = await getPromptVersion(admin, id);
  if (!version) notFound();

  const fullyScored = version.status === "scored";
  const quickTested = version.status === "quick_tested";
  const quickResults: QuickResultRow[] = quickTested ? await getQuickResults(admin, version.id) : [];

  // Look up parent version number for the header (e.g. "iteration of v1")
  let parentVersionNumber: number | null = null;
  if (version.parent_prompt_id) {
    const { data: parent } = await admin
      .from("lab_value_prompts")
      .select("version")
      .eq("id", version.parent_prompt_id)
      .maybeSingle();
    if (parent) parentVersionNumber = (parent as { version: number }).version;
  }

  // Spearman over the quick-test pool (β vs prompt score) — gives a quick
  // visual sense of correlation before committing to full scoring.
  const quickValid = quickResults.filter(r => r.score !== null && r.normalizedScore !== null);
  const quickRho = quickValid.length >= 2
    ? spearman(quickValid.map(r => r.normalizedScore as number), quickValid.map(r => r.score as number))
    : null;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft · Prompt
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>
            v{version.version}
            {parentVersionNumber !== null && (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", marginLeft: "10px" }}>
                iteration of v{parentVersionNumber}
              </span>
            )}
          </h1>
          <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>
            Created {new Date(version.created_at).toLocaleString()}
          </p>
        </div>

        <PromptDetailClient
          promptId={version.id}
          initialText={version.prompt_text}
          initialNotes={version.change_notes ?? ""}
          editable={version.editable}
          status={version.status}
          scoredCount={version.scoredCount}
          articleCount={version.articleCount}
          hasParent={version.parent_prompt_id !== null}
        />

        {/* Scoring status line — replaces the old distribution card */}
        {(version.scoredCount > 0 || version.lastScoredAt) && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "14px 18px", marginBottom: "20px", fontSize: "13px", color: "#5a6a85", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <span>
              <strong style={{ color: fullyScored ? "#059669" : "#1a1a1a" }}>
                {fullyScored ? `Scored ${version.articleCount}/${version.articleCount} articles` : `${version.scoredCount}/${version.articleCount} scored`}
              </strong>
              {version.lastScoredAt && (
                <> · last scored {new Date(version.lastScoredAt).toLocaleDateString("en-CA")}</>
              )}
              {version.quick_tested_at && !fullyScored && (
                <> · quick tested</>
              )}
            </span>
            {fullyScored && (
              <Link href={`/admin/lab/value-scoring/craft/evaluation?promptId=${version.id}`} style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}>
                Open evaluation →
              </Link>
            )}
          </div>
        )}

        {quickTested && quickResults.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>
            <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                Quick test · {quickResults.length} articles
              </span>
              {quickRho !== null && (
                <span style={{ fontSize: "11px", color: "#5a6a85" }}>
                  Spearman ρ (β vs prompt score):{" "}
                  <strong style={{ color: quickRho >= 0.7 ? "#059669" : quickRho >= 0.4 ? "#92400e" : "#b91c1c" }}>
                    {quickRho.toFixed(2)}
                  </strong>
                </span>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  <th style={{ ...thStyle, width: "44px" }}>#</th>
                  <th style={thStyle}>Title</th>
                  <th style={{ ...thStyle, width: "140px" }}>Article type</th>
                  <th style={{ ...thStyle, width: "80px", textAlign: "right" }}>BT score</th>
                  <th style={{ ...thStyle, width: "90px", textAlign: "right" }}>Prompt score</th>
                </tr>
              </thead>
              <tbody>
                {quickResults.map((r, i) => (
                  <tr key={r.article_id} style={{ borderTop: "1px solid #f5f5f5" }}>
                    <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, color: "#1a1a1a" }} title={r.title}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "360px" }}>
                        {r.title}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{r.article_type ?? "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: r.normalizedScore === null ? "#bbb" : r.normalizedScore >= 7.5 ? "#059669" : r.normalizedScore >= 3.5 ? "#1a1a1a" : "#b91c1c", fontVariantNumeric: "tabular-nums" }}>
                      {r.normalizedScore === null ? "—" : r.normalizedScore.toFixed(1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: r.score === null ? "#b91c1c" : "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
                      {r.score === null ? "failed" : r.score.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
          <Link href="/admin/lab/value-scoring/craft/prompt" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to prompt list
          </Link>
          {!version.editable && (
            <Link href={`/admin/lab/value-scoring/craft/prompt/new?from=${version.id}`} style={{ fontSize: "13px", color: "#94a3b8", textDecoration: "none" }}>
              Create new version manually →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#5a6a85",
  padding: "10px 16px",
};

const tdStyle: React.CSSProperties = {
  fontSize: "13px",
  padding: "10px 16px",
};
