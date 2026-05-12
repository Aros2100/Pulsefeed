import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, INITIAL_PAIR_BATCH, SESSION_SIZE } from "@/lib/lab/value-scoring/craft-config";
import ComputeButton from "./ComputeButton";
import RankingTable, { type ArticlePairDetail, type RankedArticle } from "./RankingTable";

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

  // Load all data in parallel
  const [
    { data: articles },
    { data: pairs },
    { data: rankings },
    { data: reasonRows },
    { data: categoryRows },
  ] = await Promise.all([
    admin.from("lab_value_articles").select("id, title, article_type").eq("module_id", moduleId),
    admin.from("lab_value_pairs").select("id, article_a_id, article_b_id, winner_id, session_id, updated_at").eq("module_id", moduleId),
    admin.from("lab_value_rankings").select("article_id, normalized_score, computed_at").eq("module_id", moduleId),
    admin.from("lab_value_pair_reasons").select("pair_id, category_id"),
    admin.from("lab_value_reason_categories").select("id, label").eq("module_id", moduleId),
  ]);

  type Art    = { id: string; title: string; article_type: string | null };
  type Pair   = { id: string; article_a_id: string; article_b_id: string; winner_id: string | null; session_id: string | null; updated_at: string | null };
  type RankR  = { article_id: string; normalized_score: number | null; computed_at: string };
  type Reason = { pair_id: string; category_id: string };
  type Cat    = { id: string; label: string };

  const arts       = (articles    ?? []) as Art[];
  const allPairs   = (pairs       ?? []) as Pair[];
  const rankingRows = (rankings   ?? []) as RankR[];
  const reasons    = (reasonRows  ?? []) as Reason[];
  const categories = (categoryRows ?? []) as Cat[];

  // Normalized BT score (1-10) by article
  const normalizedByArticle = new Map<string, number>(
    rankingRows
      .filter(r => r.normalized_score !== null)
      .map(r => [r.article_id, Number(r.normalized_score)]),
  );
  const lastComputedAt = rankingRows.length > 0
    ? rankingRows.reduce<string>((acc, r) => r.computed_at > acc ? r.computed_at : acc, rankingRows[0].computed_at)
    : null;
  const hasRanking = rankingRows.length > 0;

  // Out-of-date check: if any decided pair was updated after the last BT run,
  // the rankings are stale and the user should recompute.
  const maxPairUpdate = allPairs.reduce<string | null>((acc, p) => {
    if (!p.winner_id || !p.updated_at) return acc;
    return acc === null || p.updated_at > acc ? p.updated_at : acc;
  }, null);
  const rankingsOutOfDate = hasRanking && maxPairUpdate !== null && lastComputedAt !== null
    ? maxPairUpdate > lastComputedAt
    : false;

  // Category label map
  const catLabel = new Map<string, string>(categories.map(c => [c.id, c.label]));

  // Reason categories per pair: Map<pairId, string[]>
  const reasonsByPair = new Map<string, string[]>();
  for (const r of reasons) {
    const label = catLabel.get(r.category_id);
    if (!label) continue;
    const arr = reasonsByPair.get(r.pair_id) ?? [];
    arr.push(label);
    reasonsByPair.set(r.pair_id, arr);
  }

  // Article lookup
  const artById = new Map<string, Art>(arts.map(a => [a.id, a]));

  // Win/loss counters and pair details per article
  const wins   = new Map<string, number>(arts.map(a => [a.id, 0]));
  const losses = new Map<string, number>(arts.map(a => [a.id, 0]));
  const pairDetails = new Map<string, ArticlePairDetail[]>(arts.map(a => [a.id, []]));

  for (const p of allPairs) {
    if (!p.winner_id) continue;

    const loserId   = p.winner_id === p.article_a_id ? p.article_b_id : p.article_a_id;
    wins.set(p.winner_id, (wins.get(p.winner_id) ?? 0) + 1);
    losses.set(loserId,   (losses.get(loserId)   ?? 0) + 1);

    const cats = reasonsByPair.get(p.id) ?? [];

    // Add pair to winner's list
    const winnerOpponent = artById.get(loserId);
    if (winnerOpponent) {
      const arr = pairDetails.get(p.winner_id) ?? [];
      arr.push({
        pairId:     p.id,
        result:     "won",
        opponent:   { id: loserId, title: winnerOpponent.title, article_type: winnerOpponent.article_type, beta: normalizedByArticle.get(loserId) ?? null },
        categories: cats,
      });
      pairDetails.set(p.winner_id, arr);
    }

    // Add pair to loser's list
    const loserOpponent = artById.get(p.winner_id);
    if (loserOpponent) {
      const arr = pairDetails.get(loserId) ?? [];
      arr.push({
        pairId:     p.id,
        result:     "lost",
        opponent:   { id: p.winner_id, title: loserOpponent.title, article_type: loserOpponent.article_type, beta: normalizedByArticle.get(p.winner_id) ?? null },
        categories: cats,
      });
      pairDetails.set(loserId, arr);
    }
  }

  // Sort each article's pairs by opponent normalized score descending (strongest opponents first)
  for (const [, arr] of pairDetails) {
    arr.sort((a, b) => (b.opponent.beta ?? -Infinity) - (a.opponent.beta ?? -Infinity));
  }

  // Session summary
  const sessionMap = new Map<string, number>();
  for (const p of allPairs) {
    if (!p.session_id || !p.winner_id) continue;
    sessionMap.set(p.session_id, (sessionMap.get(p.session_id) ?? 0) + 1);
  }
  const sessionsTotal      = sessionMap.size;
  const sessionsComplete   = [...sessionMap.values()].filter(n => n >= SESSION_SIZE).length;
  const sessionsInProgress = sessionsTotal - sessionsComplete;

  const totalPairs   = allPairs.length;
  const decidedPairs = allPairs.filter(p => p.winner_id !== null).length;
  const totalTarget  = Math.max(totalPairs, INITIAL_PAIR_BATCH);
  const progressPct  = totalTarget > 0 ? Math.round((decidedPairs / totalTarget) * 100) : 0;

  // Build ranked list
  const ranked: RankedArticle[] = arts
    .map(a => {
      const w = wins.get(a.id)   ?? 0;
      const l = losses.get(a.id) ?? 0;
      const total = w + l;
      const winRate = total > 0 ? w / total : 0;
      const beta = normalizedByArticle.get(a.id) ?? null; // 1-10 normalized score
      return {
        id:           a.id,
        title:        a.title,
        article_type: a.article_type,
        wins:         w,
        losses:       l,
        winRate,
        beta,
        pairs:        pairDetails.get(a.id) ?? [],
      };
    })
    .sort((x, y) => {
      if (hasRanking) {
        const bx = x.beta ?? -Infinity;
        const by = y.beta ?? -Infinity;
        if (by !== bx) return by - bx;
      }
      if (y.wins !== x.wins) return y.wins - x.wins;
      return y.winRate - x.winRate;
    });

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              The Lab · Value Scoring · Craft
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Ranking</h1>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
              {hasRanking
                ? "Ranking based on Bradley-Terry model. NFL standing shown as supplementary information."
                : "No ranking computed yet. Showing NFL standing based on win counts."}
            </p>
          </div>
          <ComputeButton />
        </div>

        {rankingsOutOfDate && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "10px 16px", marginBottom: "16px", fontSize: "13px", color: "#92400e", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <span><strong>Rankings out of date</strong> · Pairs have been edited since the last BT computation.</span>
            <ComputeButton compact />
          </div>
        )}

        <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "20px", fontSize: "12px", color: "#92400e" }}>
          {hasRanking
            ? <>Ranking based on Bradley-Terry model when computed. NFL standing shown as supplementary information.{lastComputedAt && <> · Last computed {new Date(lastComputedAt).toLocaleString()}</>}</>
            : <>No ranking computed yet. Click &quot;Compute Bradley-Terry ranking&quot; to generate.</>}
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
              Articles · ranked by {hasRanking ? "β" : "wins (NFL fallback)"} · click to expand pairs
            </span>
          </div>
          <RankingTable ranked={ranked} />
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
