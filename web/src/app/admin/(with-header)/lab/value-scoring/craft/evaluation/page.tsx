import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import { getPromptVersions } from "@/lib/lab/value-scoring/prompt-versions";
import { computePairMatch, getDisagreements } from "@/lib/lab/value-scoring/evaluation";
import EvaluationFilters from "./EvaluationFilters";
import EvaluationActions from "./EvaluationActions";
import { type ArticleFull } from "./DisagreementList";

interface PageProps {
  searchParams: Promise<{ promptId?: string }>;
}

export default async function EvaluationPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) {
    return shell(null, null, null,
      <div style={{ background: "#fff", borderRadius: "10px", padding: "32px", textAlign: "center", fontSize: "14px", color: "#5a6a85" }}>
        Module not found.
      </div>,
    );
  }

  // Resolve the selected prompt first so we can scope to its direction.
  // If no promptId in URL, pick the most recently scored across all directions.
  const allVersions = await getPromptVersions(admin, mod.id as string);
  const allScored   = allVersions.filter(v => v.status === "scored");

  if (allScored.length === 0) {
    return shell(null, null, null,
      <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px 20px", fontSize: "13px", color: "#92400e" }}>
        No fully-scored prompt versions yet. Finish scoring a version before opening evaluation.
        <div style={{ marginTop: "10px" }}>
          <Link href="/admin/lab/value-scoring/craft/direction" style={{ fontSize: "13px", color: "#E83B2A" }}>
            ← Back to directions
          </Link>
        </div>
      </div>,
    );
  }

  const promptId = (sp.promptId && allScored.some(v => v.id === sp.promptId))
    ? sp.promptId
    : allScored[0].id;

  // Look up this prompt's direction so we can scope the version list.
  const { data: promptRow } = await admin
    .from("lab_value_prompts")
    .select("direction_id")
    .eq("id", promptId)
    .maybeSingle();
  const directionId = promptRow ? (promptRow as { direction_id: string | null }).direction_id : null;

  // Load direction name for breadcrumb.
  let directionName: string | null = null;
  if (directionId) {
    const { data: dir } = await admin.from("lab_value_directions").select("name").eq("id", directionId).maybeSingle();
    if (dir) directionName = (dir as { name: string }).name;
  }

  // Fetch direction_id for all scored versions to scope the list.
  const scoredIds = allScored.map(v => v.id);
  const { data: promptDirs } = await admin
    .from("lab_value_prompts")
    .select("id, direction_id")
    .in("id", scoredIds);
  type PDRow = { id: string; direction_id: string | null };
  const dirById = new Map<string, string | null>((promptDirs ?? []).map((r: PDRow) => [r.id, r.direction_id]));

  // Only show versions in the same direction as the selected prompt.
  const scoredInDirection = allScored.filter(v => dirById.get(v.id) === directionId);

  const [pairMatch, disagreements] = await Promise.all([
    computePairMatch(admin, promptId),
    getDisagreements(admin, promptId, { minScoreDiff: 0 }),
  ]);

  // Iteration history scoped to same direction.
  const historyByVersion = await Promise.all(
    scoredInDirection.map(async v => ({
      id:         v.id,
      version:    v.version,
      created_at: v.created_at,
      pairMatch:  v.id === promptId ? pairMatch : await computePairMatch(admin, v.id),
    })),
  );

  // Pre-fetch full article fields for disagreements.
  const articleIds = new Set<string>();
  for (const d of disagreements) {
    articleIds.add(d.articleA.id);
    articleIds.add(d.articleB.id);
  }
  const articles: Record<string, ArticleFull> = {};
  if (articleIds.size > 0) {
    const { data: rows } = await admin
      .from("lab_value_articles")
      .select("id, title, journal, article_type, published_date, pmid, short_headline, resume, bottom_line, sari")
      .in("id", [...articleIds]);
    for (const r of (rows ?? []) as ArticleFull[]) articles[r.id] = r;
  }

  const selectedVersion = scoredInDirection.find(v => v.id === promptId)
    ?? allScored.find(v => v.id === promptId)!;

  return shell(directionId, directionName, selectedVersion.version,
    <>
      <EvaluationFilters
        versions={scoredInDirection.map(v => ({ id: v.id, version: v.version, scoredCount: v.scoredCount, articleCount: v.articleCount }))}
        promptId={promptId}
      />

      {/* Iteration history — scoped to direction */}
      {historyByVersion.length > 1 && (
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Iteration history
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafbfc" }}>
                <th style={{ ...thStyle, width: "80px" }}>Version</th>
                <th style={{ ...thStyle, width: "120px", textAlign: "right" }}>Pair-match</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {historyByVersion.map(h => {
                const selected = h.id === promptId;
                return (
                  <tr key={h.id} style={{ borderTop: "1px solid #f5f5f5", background: selected ? "#fff4f3" : undefined }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {selected ? (
                        <span>v{h.version} <span style={{ fontSize: "10px", color: "#E83B2A", fontWeight: 700, marginLeft: "4px" }}>SELECTED</span></span>
                      ) : (
                        <Link href={`?promptId=${h.id}`} style={{ color: "#E83B2A", textDecoration: "none" }}>
                          v{h.version}
                        </Link>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: h.pairMatch.matchPercent >= 75 ? "#059669" : h.pairMatch.matchPercent >= 60 ? "#92400e" : "#b91c1c" }}>
                      {h.pairMatch.matchPercent.toFixed(1)}%
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pair-match metric */}
      <div style={{ marginBottom: "20px" }}>
        <MetricCard
          title="Pair-match"
          value={`${pairMatch.matchPercent.toFixed(1)}%`}
          subtitle={`Prompt matched your choice on ${pairMatch.matches} of ${pairMatch.totalPairs} pairs${pairMatch.ties > 0 ? ` · ${pairMatch.ties} ties` : ""}`}
          accent={pairMatch.matchPercent >= 75 ? "#059669" : pairMatch.matchPercent >= 60 ? "#92400e" : "#b91c1c"}
        />
      </div>

      {/* Disagreements card */}
      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
            Disagreements · v{selectedVersion.version} · {disagreements.length} total
          </span>
        </div>
        <EvaluationActions
          rows={disagreements}
          articles={articles}
          promptId={promptId}
          promptVersion={selectedVersion.version}
        />
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
        <Link
          href={directionId ? `/admin/lab/value-scoring/craft/direction/${directionId}` : "/admin/lab/value-scoring/craft/direction"}
          style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}
        >
          ← Back to {directionName ?? "directions"}
        </Link>
        <Link href={`/admin/lab/value-scoring/craft/prompt/new?from=${promptId}${directionId ? `&directionId=${directionId}` : ""}`} style={{ fontSize: "13px", color: "#94a3b8", textDecoration: "none" }}>
          Create version manually →
        </Link>
      </div>
    </>,
  );
}

function MetricCard({ title, value, subtitle, accent }: { title: string; value: string; subtitle: string; accent: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
        {title}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: "6px" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#5a6a85" }}>{subtitle}</div>
    </div>
  );
}

function shell(
  directionId: string | null,
  directionName: string | null,
  version: number | null,
  children: React.ReactNode,
) {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft
            {directionName && directionId && (
              <> · <Link href={`/admin/lab/value-scoring/craft/direction/${directionId}`} style={{ color: "#E83B2A", textDecoration: "none" }}>{directionName}</Link></>
            )}
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>
            Evaluation{version !== null ? ` · v${version}` : ""}
          </h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Test how well the prompt matches your pairwise choices, then iterate based on the disagreements.
          </p>
        </div>
        {children}
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
