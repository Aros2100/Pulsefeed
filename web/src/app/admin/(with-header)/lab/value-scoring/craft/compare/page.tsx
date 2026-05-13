import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePairMatch, getDisagreements } from "@/lib/lab/value-scoring/evaluation";
// ArticleFull is defined in the DisagreementList component but only needed here for type annotation
type ArticleFull = { id: string; title: string; journal: string | null; article_type: string | null; published_date: string | null; pmid: string | null; short_headline: string | null; resume: string | null; bottom_line: string | null; sari: unknown };

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { a: idA, b: idB } = await searchParams;

  if (!idA || !idB) {
    return shell(
      <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px 20px", fontSize: "13px", color: "#92400e" }}>
        Provide two experiment IDs via ?a=&b= query params.
      </div>,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Load both prompts
  const [{ data: pA }, { data: pB }] = await Promise.all([
    admin.from("lab_value_prompts").select("id, version, change_notes, direction_id").eq("id", idA).maybeSingle(),
    admin.from("lab_value_prompts").select("id, version, change_notes, direction_id").eq("id", idB).maybeSingle(),
  ]);
  if (!pA || !pB) {
    return shell(<div style={{ color: "#b91c1c", fontSize: "13px" }}>One or both experiments not found.</div>);
  }
  type P = { id: string; version: number; change_notes: string | null; direction_id: string | null };
  const promptA = pA as P;
  const promptB = pB as P;

  // Pair-match for both
  const [pmA, pmB, disagA, disagB] = await Promise.all([
    computePairMatch(admin, promptA.id),
    computePairMatch(admin, promptB.id),
    getDisagreements(admin, promptA.id, { minScoreDiff: 0 }),
    getDisagreements(admin, promptB.id, { minScoreDiff: 0 }),
  ]);

  // Pairs where they diverge: A matches clinician but B doesn't, or vice versa
  const pairIdsA = new Set(disagA.map(d => d.pairId)); // A got wrong
  const pairIdsB = new Set(disagB.map(d => d.pairId)); // B got wrong
  const onlyAWrong = disagA.filter(d => !pairIdsB.has(d.pairId)); // B fixed these
  const onlyBWrong = disagB.filter(d => !pairIdsA.has(d.pairId)); // A had these right

  // Load article details for display
  const articleIds = new Set<string>();
  for (const d of [...onlyAWrong.slice(0, 10), ...onlyBWrong.slice(0, 10)]) {
    articleIds.add(d.articleA.id); articleIds.add(d.articleB.id);
  }
  const articles: Record<string, ArticleFull> = {};
  if (articleIds.size > 0) {
    const { data: rows } = await admin
      .from("lab_value_articles")
      .select("id, title, journal, article_type, published_date, pmid, short_headline, resume, bottom_line, sari")
      .in("id", [...articleIds]);
    for (const r of (rows ?? []) as ArticleFull[]) articles[r.id] = r;
  }

  return shell(
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {[{ prompt: promptA, pm: pmA }, { prompt: promptB, pm: pmB }].map(({ prompt, pm }) => (
          <div key={prompt.id} style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>v{prompt.version}</div>
                <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "2px" }}>{prompt.change_notes ?? "—"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "24px", fontWeight: 700, color: pm.matchPercent >= 75 ? "#059669" : "#92400e", fontVariantNumeric: "tabular-nums" }}>
                  {pm.matchPercent.toFixed(1)}%
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>{pm.matches}/{pm.totalPairs} pairs</div>
              </div>
            </div>
            <Link href={`/admin/lab/value-scoring/craft/evaluation?promptId=${prompt.id}`} style={{ fontSize: "12px", color: "#E83B2A", textDecoration: "none", display: "inline-block", marginTop: "10px" }}>
              Open evaluation →
            </Link>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <SectionCard title={`B fixed (${onlyAWrong.length} pairs)`} subtitle={`v${promptA.version} got wrong, v${promptB.version} got right`} accent="#059669">
          {onlyAWrong.slice(0, 8).map(d => {
            const human = d.humanChoiceId === d.articleA.id ? d.articleA : d.articleB;
            return (
              <div key={d.pairId} style={{ borderTop: "1px solid #f0f0f0", paddingTop: "8px", marginTop: "8px", fontSize: "12px" }}>
                <div style={{ color: "#1a1a1a", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={human.title}>{human.title}</div>
                <div style={{ color: "#94a3b8", fontSize: "11px" }}>{d.reasons.join(" · ") || "—"} · Craft Δ{d.craftDiff.toFixed(0)}</div>
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title={`A fixed (${onlyBWrong.length} pairs)`} subtitle={`v${promptB.version} got wrong, v${promptA.version} got right`} accent="#b91c1c">
          {onlyBWrong.slice(0, 8).map(d => {
            const human = d.humanChoiceId === d.articleA.id ? d.articleA : d.articleB;
            return (
              <div key={d.pairId} style={{ borderTop: "1px solid #f0f0f0", paddingTop: "8px", marginTop: "8px", fontSize: "12px" }}>
                <div style={{ color: "#1a1a1a", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={human.title}>{human.title}</div>
                <div style={{ color: "#94a3b8", fontSize: "11px" }}>{d.reasons.join(" · ") || "—"} · Craft Δ{d.craftDiff.toFixed(0)}</div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
        {pairIdsA.size + pairIdsB.size - onlyAWrong.length - onlyBWrong.length} pairs both got wrong · {pairIdsA.size} total A errors · {pairIdsB.size} total B errors
      </div>
    </>,
  );
}

function SectionCard({ title, subtitle, accent, children }: { title: string; subtitle: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: accent }}>{title}</div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{subtitle}</div>
      </div>
      <div style={{ padding: "12px 16px" }}>{children}</div>
    </div>
  );
}

function shell(children: React.ReactNode) {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Compare experiments</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Pairs where one experiment matches the clinician and the other doesn&apos;t.
          </p>
        </div>
        {children}
        <div style={{ marginTop: "24px" }}>
          <Link href="/admin/lab/value-scoring/craft/direction" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to directions
          </Link>
        </div>
      </div>
    </div>
  );
}
