import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, INITIAL_PAIR_BATCH, SESSION_SIZE } from "@/lib/lab/value-scoring/craft-config";

export default async function CraftRankingPage() {
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
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#5a6a85" }}>Module not found.</div>
            <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: "#E83B2A" }}>
              ← Back to Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const moduleId = mod.id as string;

  // Articles
  const { data: articles } = await admin
    .from("lab_value_articles")
    .select("id, title, article_type")
    .eq("module_id", moduleId);

  type Art = { id: string; title: string; article_type: string | null };
  const arts = (articles ?? []) as Art[];

  // Pairs
  const { data: pairs } = await admin
    .from("lab_value_pairs")
    .select("article_a_id, article_b_id, winner_id, session_id")
    .eq("module_id", moduleId);

  type Pair = { article_a_id: string; article_b_id: string; winner_id: string | null; session_id: string | null };
  const allPairs = (pairs ?? []) as Pair[];

  const totalPairs   = allPairs.length;
  const decidedPairs = allPairs.filter(p => p.winner_id !== null).length;

  // Win/loss per article
  const wins   = new Map<string, number>(arts.map(a => [a.id, 0]));
  const losses = new Map<string, number>(arts.map(a => [a.id, 0]));
  for (const p of allPairs) {
    if (!p.winner_id) continue;
    const loserId = p.winner_id === p.article_a_id ? p.article_b_id : p.article_a_id;
    wins.set(p.winner_id, (wins.get(p.winner_id) ?? 0) + 1);
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
  }

  // Session summary
  const sessionMap = new Map<string, number>(); // session_id → decided count
  for (const p of allPairs) {
    if (!p.session_id || !p.winner_id) continue;
    sessionMap.set(p.session_id, (sessionMap.get(p.session_id) ?? 0) + 1);
  }
  const sessionsTotal    = sessionMap.size;
  const sessionsComplete = [...sessionMap.values()].filter(n => n >= SESSION_SIZE).length;
  const sessionsInProgress = sessionsTotal - sessionsComplete;

  // Rank rows
  const ranked = arts
    .map(a => {
      const w = wins.get(a.id)   ?? 0;
      const l = losses.get(a.id) ?? 0;
      const total = w + l;
      const winRate = total > 0 ? w / total : 0;
      return { ...a, wins: w, losses: l, total, winRate };
    })
    .sort((x, y) => {
      if (y.wins !== x.wins) return y.wins - x.wins;
      return y.winRate - x.winRate;
    });

  const totalTarget = Math.max(totalPairs, INITIAL_PAIR_BATCH);
  const progressPct = totalTarget > 0 ? Math.round((decidedPairs / totalTarget) * 100) : 0;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Ranking</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Preliminary ranking based on completed pairwise comparisons.
          </p>
        </div>

        <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "20px", fontSize: "12px", color: "#92400e" }}>
          Note: Final ranking will be computed using a Bradley-Terry model. This is a preliminary view based on simple win counts.
        </div>

        {/* Progress card */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Progress
            </span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{decidedPairs} / {totalPairs}</div>
              <div style={{ fontSize: "12px", color: "#888" }}>{progressPct}%</div>
            </div>
            <div style={{ height: "8px", background: "#f0f0f0", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: `${progressPct}%`, height: "100%", background: "#E83B2A", transition: "width 0.3s" }} />
            </div>
            <div style={{ marginTop: "16px", fontSize: "12px", color: "#5a6a85", display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <span>{sessionsComplete} session{sessionsComplete !== 1 ? "s" : ""} complete</span>
              <span>·</span>
              <span>{sessionsInProgress} in progress</span>
            </div>
          </div>
        </div>

        {/* Ranking table */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Articles · ranked by wins
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafbfc" }}>
                <th style={{ ...thStyle, width: "48px" }}>#</th>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, width: "150px" }}>Article type</th>
                <th style={{ ...thStyle, width: "70px", textAlign: "right" }}>W</th>
                <th style={{ ...thStyle, width: "70px", textAlign: "right" }}>L</th>
                <th style={{ ...thStyle, width: "90px", textAlign: "right" }}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f5f5f5" }}>
                  <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, color: "#1a1a1a" }} title={r.title}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "420px" }}>
                      {r.title}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{r.article_type ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#059669", fontWeight: 600 }}>{r.wins}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#b91c1c" }}>{r.losses}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: r.total === 0 ? "#bbb" : "#1a1a1a" }}>
                    {r.total === 0 ? "—" : `${Math.round(r.winRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to module
          </Link>
          {mod.phase === "pairwise" && (
            <Link href="/admin/lab/value-scoring/craft/pairwise" style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none" }}>
              Continue pairwise →
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
