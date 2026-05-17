import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import { computePairMatch } from "@/lib/lab/value-scoring/evaluation";
import DirectionEditClient from "./DirectionEditClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

function statusLabel(scoredCount: number, articleCount: number): { text: string; color: string } {
  if (scoredCount === 0) return { text: "Draft", color: "#92400e" };
  if (scoredCount >= articleCount) return { text: "Scored", color: "#059669" };
  return { text: `${scoredCount}/${articleCount}`, color: "#1e40af" };
}

export default async function DirectionDetailPage({ params }: PageProps) {
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();
  if (!mod) notFound();

  const { data: direction } = await admin
    .from("lab_value_directions")
    .select("id, name, description")
    .eq("id", id)
    .eq("module_id", mod.id)
    .maybeSingle();
  if (!direction) notFound();

  type Dir = { id: string; name: string; description: string | null };
  const dir = direction as Dir;

  // Load experiments (prompts) in this direction
  const { data: prompts } = await admin
    .from("lab_value_prompts")
    .select("id, version, change_notes, created_at, quick_tested_at, parent_prompt_id")
    .eq("direction_id", id)
    .order("version");
  type Prompt = { id: string; version: number; change_notes: string | null; created_at: string; quick_tested_at: string | null; parent_prompt_id: string | null };
  const ps = (prompts ?? []) as Prompt[];

  // Load article count
  const { count: articleCount } = await admin
    .from("lab_value_articles")
    .select("id", { count: "exact", head: true })
    .eq("module_id", mod.id);

  const totalArticles = articleCount ?? 0;

  // Load score counts per prompt
  const promptIds = ps.map(p => p.id);
  const { data: scoreCounts } = promptIds.length > 0 ? await admin
    .from("lab_value_article_scores")
    .select("prompt_id")
    .in("prompt_id", promptIds)
    .not("craft_score", "is", null)
    .limit(10000) : { data: [] };
  type SC = { prompt_id: string };
  const countByPrompt = new Map<string, number>();
  for (const s of (scoreCounts ?? []) as SC[]) {
    countByPrompt.set(s.prompt_id, (countByPrompt.get(s.prompt_id) ?? 0) + 1);
  }

  // Compute pair-match for fully-scored experiments
  const experiments = await Promise.all(ps.map(async p => {
    const scored = countByPrompt.get(p.id) ?? 0;
    let pairMatch: number | null = null;
    if (scored >= totalArticles && totalArticles > 0) {
      try {
        const pm = await computePairMatch(admin, p.id);
        if (pm.totalPairs > 0) pairMatch = pm.matchPercent;
      } catch { /* unscored */ }
    }
    return { ...p, scoredCount: scored, pairMatch };
  }));

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft · Directions
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>{dir.name}</h1>
              {dir.description && (
                <p style={{ fontSize: "13px", color: "#5a6a85", margin: 0, lineHeight: 1.5 }}>{dir.description}</p>
              )}
            </div>
            <DirectionEditClient
              directionId={dir.id}
              initialName={dir.name}
              initialDescription={dir.description ?? ""}
            />
          </div>
        </div>

        {/* Experiments card */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Versions · {experiments.length}
            </span>
            <Link
              href={`/admin/lab/value-scoring/craft/prompt/new?directionId=${dir.id}`}
              style={{ fontSize: "12px", color: "#E83B2A", fontWeight: 600, textDecoration: "none", padding: "4px 10px", border: "1px solid #E83B2A", borderRadius: "5px" }}
            >
              + New version
            </Link>
          </div>

          {experiments.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              No versions yet. Create one to start scoring.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  <th style={thStyle}>Version</th>
                  <th style={thStyle}>Name</th>
                  <th style={{ ...thStyle, width: "90px", textAlign: "right" }}>Pair-match</th>
                  <th style={{ ...thStyle, width: "80px", textAlign: "center" }}>Status</th>
                  <th style={{ ...thStyle, width: "120px" }}>Created</th>
                  <th style={{ ...thStyle, width: "70px", textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {experiments.map(e => {
                  const { text: statusText, color: statusColor } = statusLabel(e.scoredCount, totalArticles);
                  return (
                    <tr key={e.id} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "#94a3b8" }}>v{e.version}</td>
                      <td style={{ ...tdStyle, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px" }}>
                        {e.change_notes ?? <em style={{ color: "#bbb" }}>—</em>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: e.pairMatch === null ? "#bbb" : e.pairMatch >= 75 ? "#059669" : "#92400e" }}>
                        {e.pairMatch === null ? "—" : `${e.pairMatch.toFixed(1)}%`}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor, background: `${statusColor}18`, padding: "2px 7px", borderRadius: "4px" }}>
                          {statusText}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>
                        {new Date(e.created_at).toLocaleDateString("en-CA")}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link href={`/admin/lab/value-scoring/craft/prompt/${e.id}`} style={{ fontSize: "12px", color: "#E83B2A", textDecoration: "none" }}>
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Compare link — only when 2+ experiments scored */}
        {experiments.filter(e => e.pairMatch !== null).length >= 2 && (
          <div style={{ marginTop: "16px", textAlign: "right" }}>
            <Link
              href={`/admin/lab/value-scoring/craft/compare?${experiments.filter(e => e.pairMatch !== null).map((e, i) => `${i === 0 ? "a" : "b"}=${e.id}`).slice(0, 2).join("&")}`}
              style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}
            >
              Compare top 2 versions →
            </Link>
          </div>
        )}

        <div style={{ marginTop: "24px" }}>
          <Link href="/admin/lab/value-scoring/craft/direction" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to directions
          </Link>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "#5a6a85", padding: "10px 16px",
};
const tdStyle: React.CSSProperties = { fontSize: "13px", padding: "10px 16px" };
