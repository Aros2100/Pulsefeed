import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import ArticleStamkort from "@/components/articles/ArticleStamkort";
import AdminArticleTabs from "./AdminArticleTabs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function specialtyLabel(slug: string) {
  return SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
}

// ── Timeline colours ──────────────────────────────────────────────────────────

const COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  imported:       { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff",  label: "Import" },
  enriched:       { dot: "#8b5cf6", border: "#ddd6fe", bg: "#f5f3ff",  label: "AI Berigelse" },
  lab_decision:   { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4",  label: "Lab" },
  feedback:       { dot: "#f59e0b", border: "#fde68a", bg: "#fffbeb",  label: "Feedback" },
  status_changed: { dot: "#f97316", border: "#fed7aa", bg: "#fff7ed",  label: "Status ændret" },
  verified:       { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4",  label: "Verificeret" },
  author_linked:  { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff",  label: "Forfattere" },
  quality_check:  { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb",  label: "Quality Check" },
};

const FALLBACK_COLOR = { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb", label: "Event" };

// ── Badge / KV ────────────────────────────────────────────────────────────────

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    green:  { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    red:    { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    blue:   { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    purple: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
    orange: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
    gray:   { bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
  };
  const s = styles[color] ?? styles.blue;
  return (
    <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {children}
    </span>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px" }}>
      <span style={{ color: "#5a6a85", minWidth: "140px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

// ── Event cards ───────────────────────────────────────────────────────────────

type P = Record<string, unknown>;

function ImportedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Cirkel"            value={p.circle != null ? `Circle ${p.circle}` : null} />
      <KV label="Status ved import" value={
        <Badge color={p.status === "approved" ? "green" : "blue"}>{String(p.status ?? "pending")}</Badge>
      } />
      {Array.isArray(p.specialty_tags) && (p.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty tags" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.specialty_tags as string[]).map((s) => (
              <Badge key={s} color="blue">{specialtyLabel(s)}</Badge>
            ))}
          </span>
        } />
      )}
      {p.filter_name ? <KV label="Filter" value={String(p.filter_name)} /> : null}
    </div>
  );
}

function EnrichedCard({ p }: { p: P }) {
  const conf = p.specialty_confidence as number | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="AI beslutning"       value={p.ai_decision ? <Badge color={p.ai_decision === "approved" ? "green" : "red"}>{String(p.ai_decision)}</Badge> : null} />
      <KV label="Specialty confidence" value={conf != null ? `${conf.toFixed(1)}%` : null} />
      <KV label="Model"               value={p.model_version as string | null} />
      {Array.isArray(p.specialty_tags) && (p.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty tags" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.specialty_tags as string[]).map((s) => (
              <Badge key={s} color="purple">{specialtyLabel(s)}</Badge>
            ))}
          </span>
        } />
      )}
    </div>
  );
}

function LabDecisionCard({ p, statusChange, verifiedChange }: { p: P; statusChange?: P; verifiedChange?: P }) {
  const editorVerdict = p.editor_verdict as string | null;
  const aiVerdict     = p.ai_verdict as string | null;
  const confidence    = p.confidence as number | null;
  const agree         = !aiVerdict || editorVerdict === aiVerdict;
  const verdictColor  = (v: string) =>
    v === "approved" || v === "relevant" ? "green" : v === "unsure" ? "orange" : "red";
  const statusColor   = (v: string) =>
    v === "approved" ? "green" : v === "rejected" ? "red" : "orange";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Modul"      value={p.module as string | null} />
      <KV label="Beslutning" value={editorVerdict ? <Badge color={verdictColor(editorVerdict)}>{editorVerdict}</Badge> : null} />
      {aiVerdict && (
        <KV label="AI beslutning" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Badge color={verdictColor(aiVerdict)}>{aiVerdict}</Badge>
            {agree
              ? <span style={{ fontSize: "11px", color: "#15803d" }}>✓ enig</span>
              : <span style={{ fontSize: "11px", color: "#b91c1c" }}>✗ uenig</span>
            }
          </span>
        } />
      )}
      {confidence != null && <KV label="AI confidence" value={`${confidence.toFixed(1)}%`} />}
      {p.disagreement_reason ? (
        <KV label="Årsag til uenighed" value={<span style={{ color: "#b91c1c" }}>{String(p.disagreement_reason)}</span>} />
      ) : null}
      {statusChange?.from != null && statusChange?.to != null && (
        <KV label="Status" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Badge color={statusColor(String(statusChange.from))}>{String(statusChange.from)}</Badge>
            <span style={{ fontSize: "11px", color: "#9ca3af" }}>→</span>
            <Badge color={statusColor(String(statusChange.to))}>{String(statusChange.to)}</Badge>
          </span>
        } />
      )}
      {verifiedChange?.to != null && (
        <KV label="Verificeret" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Badge color={verifiedChange.from ? "green" : "gray"}>{verifiedChange.from ? "Ja" : "Nej"}</Badge>
            <span style={{ fontSize: "11px", color: "#9ca3af" }}>→</span>
            <Badge color={verifiedChange.to ? "green" : "red"}>{verifiedChange.to ? "Ja" : "Nej"}</Badge>
          </span>
        } />
      )}
    </div>
  );
}

function FeedbackCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Uge / År"        value={p.week != null ? `Uge ${p.week}, ${p.year}` : null} />
      {p.decision ? (
        <KV label="Beslutning" value={<Badge color={p.decision === "selected" ? "green" : "gray"}>{String(p.decision)}</Badge>} />
      ) : null}
      {p.news_value != null         && <KV label="Nyhedsværdi"    value={`${p.news_value} / 5`} />}
      {p.clinical_relevance != null && <KV label="Klinisk relevans" value={String(p.clinical_relevance)} />}
    </div>
  );
}

function StatusChangedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.from ? <KV label="Fra" value={<Badge color="gray">{String(p.from)}</Badge>} /> : null}
      {p.to ? <KV label="Til" value={
        <Badge color={p.to === "approved" ? "green" : p.to === "rejected" ? "red" : "orange"}>{String(p.to)}</Badge>
      } /> : null}
      {p.reason ? <KV label="Årsag" value={String(p.reason)} /> : null}
    </div>
  );
}

function VerifiedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Verificeret" value={<Badge color={p.verified ? "green" : "red"}>{p.verified ? "Ja" : "Nej"}</Badge>} />
      {p.by ? <KV label="Af" value={String(p.by)} /> : null}
    </div>
  );
}

function AuthorLinkedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Forfattere linket" value={p.authors_linked != null ? String(p.authors_linked) : null} />
      <KV label="Nye"               value={p.new != null ? String(p.new) : null} />
      <KV label="Duplikater"        value={p.duplicates != null ? String(p.duplicates) : null} />
      {(p.rejected as number) > 0   && <KV label="Afvist" value={String(p.rejected)} />}
    </div>
  );
}

function QualityCheckCard({ p }: { p: P }) {
  const passed = p.passed as boolean | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {passed != null && (
        <KV label="Resultat" value={<Badge color={passed ? "green" : "red"}>{passed ? "Passed" : "Failed"}</Badge>} />
      )}
      {p.message ? <KV label="Besked" value={String(p.message)} /> : null}
    </div>
  );
}

function EventCard({ eventType, payload }: { eventType: string; payload: P }) {
  switch (eventType) {
    case "imported":       return <ImportedCard      p={payload} />;
    case "enriched":       return <EnrichedCard      p={payload} />;
    case "lab_decision":   return <LabDecisionCard   p={payload} />;
    case "feedback":       return <FeedbackCard      p={payload} />;
    case "status_changed": return <StatusChangedCard p={payload} />;
    case "verified":       return <VerifiedCard      p={payload} />;
    case "author_linked":  return <AuthorLinkedCard  p={payload} />;
    case "quality_check":  return <QualityCheckCard  p={payload} />;
    default:
      return (
        <pre style={{ fontSize: "11px", color: "#6b7280", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminArticleLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [articleResult, eventsResult, authorLinksResult] = await Promise.all([
    admin.from("articles").select("*").eq("id", id).maybeSingle(),
    admin.from("article_events" as never).select("*").eq("article_id", id).order("created_at", { ascending: true }),
    admin.from("article_authors").select("author_id, position").eq("article_id", id),
  ]);

  const article = articleResult.data;
  if (!article) notFound();

  // Map position → author_id for linking author names
  const authorIdByPosition = new Map(
    (authorLinksResult.data ?? []).map((r) => [r.position as number, r.author_id as string])
  );

  const events = (eventsResult.data ?? []) as {
    id: string;
    event_type: string;
    payload: P;
    created_at: string;
  }[];

  const statusColor = article.status === "approved" ? "#15803d"
    : article.status === "rejected" ? "#b91c1c"
    : "#d97706";

  // ── Tab content ───────────────────────────────────────────────────────────────

  const pubmedTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <ArticleStamkort article={article} authorIdByPosition={authorIdByPosition} />
    </div>
  );

  const SECTIONS: { title: string; types: string[] }[] = [
    { title: "Indlæsning af artikel",    types: ["imported"] },
    { title: "Indlæsning af forfattere", types: ["author_linked"] },
    { title: "Speciale scoring",         types: ["enriched"] },
    { title: "Validering",               types: ["lab_decision"] },
  ];

  const grouped = SECTIONS.map((s) => ({
    ...s,
    events: events.filter((ev) => s.types.includes(ev.event_type)),
  }));

  // Pre-pair status_changed / verified events onto their nearest lab_decision (within 60s)
  const statusChangedEvents = events.filter((ev) => ev.event_type === "status_changed");
  const verifiedEvents      = events.filter((ev) => ev.event_type === "verified");

  function findClosest(source: typeof events[0], candidates: typeof events) {
    const t = new Date(source.created_at).getTime();
    return candidates.reduce<typeof events[0] | null>((best, c) => {
      const diff = Math.abs(new Date(c.created_at).getTime() - t);
      const bestDiff = best ? Math.abs(new Date(best.created_at).getTime() - t) : Infinity;
      return diff < bestDiff && diff < 60_000 ? c : best;
    }, null);
  }

  const historikTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {grouped.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "16px", paddingBottom: "8px", borderBottom: "1px solid #e5e7eb" }}>
              {section.title}
            </div>

            {section.events.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                Ikke gennemført endnu
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: "15px", top: "8px", bottom: "8px", width: "2px", background: "#e5e7eb" }} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {section.events.map((ev) => {
                    const c = COLORS[ev.event_type] ?? FALLBACK_COLOR;
                    return (
                      <div key={ev.id} style={{ display: "flex", gap: "20px", alignItems: "flex-start", paddingBottom: "24px" }}>
                        <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", background: c.bg, border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, position: "relative" }}>
                          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.dot }} />
                        </div>
                        <div style={{ flex: 1, background: "#fff", borderRadius: "8px", border: `1px solid ${c.border}`, padding: "14px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: c.dot, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</span>
                            <span style={{ fontSize: "11px", color: "#9ca3af" }}>{fmt(ev.created_at)}</span>
                          </div>
                          {ev.event_type === "lab_decision"
                            ? <LabDecisionCard
                                p={ev.payload}
                                statusChange={findClosest(ev, statusChangedEvents)?.payload}
                                verifiedChange={findClosest(ev, verifiedEvents)?.payload}
                              />
                            : <EventCard eventType={ev.event_type} payload={ev.payload} />
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 0" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/articles" style={{ color: "#5a6a85", textDecoration: "none" }}>← Artikler</Link>
        </div>

        {/* Article header */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "24px", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.4, margin: "0 0 12px" }}>
            {article.title}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {((article.specialty_tags as string[] | null) ?? []).length > 0
              ? (article.specialty_tags as string[]).map((tag) => (
                  <span key={tag} style={{ fontSize: "11px", fontWeight: 700, borderRadius: "999px", padding: "3px 10px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
                    {specialtyLabel(tag)}
                  </span>
                ))
              : <span style={{ fontSize: "12px", color: "#9ca3af" }}>Ingen speciale-tags</span>
            }
          </div>
        </div>

      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px" }}>
        <AdminArticleTabs pubmed={pubmedTab} historik={historikTab} />
      </div>
    </div>
  );
}
