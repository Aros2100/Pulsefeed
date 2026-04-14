import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import ArticleStamkort, { type ArticleData } from "@/components/articles/ArticleStamkort";
import AdminArticleTabs from "./AdminArticleTabs";
import ArticleEditableFields from "./ArticleEditableFields";
import { getSubspecialties } from "@/lib/lab/classification-options";
import GeoCard from "./GeoCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function specialtyLabel(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

// ── Timeline colours ──────────────────────────────────────────────────────────

const COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  imported:       { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff",  label: "Article imported" },
  enriched:       { dot: "#8b5cf6", border: "#ddd6fe", bg: "#f5f3ff",  label: "AI Berigelse" },
  lab_decision:   { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4",  label: "Lab" },
  feedback:       { dot: "#f59e0b", border: "#fde68a", bg: "#fffbeb",  label: "Feedback" },
  status_changed: { dot: "#f97316", border: "#fed7aa", bg: "#fff7ed",  label: "Status ændret" },
  verified:       { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4",  label: "Verificeret" },
  author_linked:  { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff",  label: "Authors linked to article" },
  quality_check:          { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb",  label: "Quality Check" },
  auto_tagged:            { dot: "#0891b2", border: "#a5f3fc", bg: "#ecfeff",  label: "Auto-Tagged" },
  citation_count_updated: { dot: "#0891b2", border: "#a5f3fc", bg: "#ecfeff",  label: "Citation count updated" },
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

// ── Card helpers (same style as ArticleStamkort) ─────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      marginBottom: "12px",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function CardHeader({ label, green }: { label: string; green?: boolean }) {
  return (
    <div style={{
      background: green ? "#f0f7ee" : "#EEF2F7",
      borderBottom: `1px solid ${green ? "#c8e6c0" : "#dde3ed"}`,
      padding: "10px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em",
        color: green ? "#3a7d44" : "#5a6a85",
        textTransform: "uppercase", fontWeight: 700,
      }}>
        {label}
      </div>
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 24px" }}>{children}</div>;
}

function CardKVRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px" }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

// ── Event cards ───────────────────────────────────────────────────────────────

type P = Record<string, unknown>;

function ImportedCard({ p }: { p: P }) {
  const circle = p.circle as number | null;
  const approvalBadge = p.approval_method === "journal"
    ? <Badge color="blue">Auto-approved by journal</Badge>
    : p.approval_method === "human"
      ? <Badge color="green">Approved by editor</Badge>
      : <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {circle != null && (
        <KV label="Circle" value={<Badge color="blue">{`Circle ${circle}`}</Badge>} />
      )}
      {p.status != null && (
        <KV label="Status" value={
          <Badge color={p.status === "approved" ? "green" : "orange"}>{String(p.status)}</Badge>
        } />
      )}
      {Array.isArray(p.specialty_tags) && (p.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.specialty_tags as string[]).map((s) => (
              <Badge key={s} color="blue">{specialtyLabel(s)}</Badge>
            ))}
          </span>
        } />
      )}
      <KV label="Approval method" value={approvalBadge} />
      {circle === 2 && p.source_id != null && (
        <KV label="Source ID" value={String(p.source_id)} />
      )}
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
      <KV label="Authors linked" value={p.authors_linked != null ? String(p.authors_linked) : null} />
      <KV label="New"            value={p.new != null ? String(p.new) : null} />
      <KV label="Existing authors matched" value={p.duplicates != null ? String(p.duplicates) : null} />
      {(p.rejected as number) > 0 && <KV label="Rejected" value={String(p.rejected)} />}
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

function ImpactFactorUpdatedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Impact Factor" value={p.impact_factor != null ? (p.impact_factor as number).toFixed(3) : "—"} />
      <KV label="H-index"       value={p.journal_h_index != null ? String(p.journal_h_index) : "—"} />
    </div>
  );
}

function CitationCountUpdatedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Citation count" value={p.citation_count != null ? String(p.citation_count) : "—"} />
    </div>
  );
}

function AutoTaggedCard({ p }: { p: P }) {
  const score     = p.mesh_score as number | null;
  const threshold = p.threshold as number | null;
  const source    = p.source as string | null;
  const terms     = (p.matched_terms ?? []) as { term: string; approve_rate: number; total_decisions: number }[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {score != null && <KV label="Mesh Score" value={<><strong>{score}</strong>{threshold != null && <span style={{ color: "#888" }}> / {threshold}</span>}</>} />}
      {source && <KV label="Kilde" value={<Badge color="blue">{source}</Badge>} />}
      {terms.length > 0 && (
        <div style={{ marginTop: "4px" }}>
          <div style={{ fontSize: "11px", color: "#5a6a85", marginBottom: "4px", fontWeight: 600 }}>Matchede MeSH terms</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {terms.map((t) => (
              <div key={t.term} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                <span style={{ color: "#1a1a1a" }}>{t.term}</span>
                <span style={{ color: "#888" }}>{t.approve_rate}% · {t.total_decisions} beslutninger</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
    case "quality_check":          return <QualityCheckCard          p={payload} />;
    case "auto_tagged":            return <AutoTaggedCard            p={payload} />;
    case "impact_factor_updated":  return <ImpactFactorUpdatedCard   p={payload} />;
    case "citation_count_updated": return <CitationCountUpdatedCard  p={payload} />;
    default:
      return (
        <pre style={{ fontSize: "11px", color: "#6b7280", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
  }
}

// ── Berigelse helpers ─────────────────────────────────────────────────────────

function EvidenceScore({ value }: { value: number }) {
  const pct   = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? "#15803d" : pct >= 40 ? "#d97706" : "#E83B2A";
  const bg    = pct >= 70 ? "#f0fdf4" : pct >= 40 ? "#fffbeb" : "#fef2f2";
  const label = pct >= 70 ? "Strong" : pct >= 40 ? "Moderate" : "Limited";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "16px",
      background: bg, borderRadius: "8px", padding: "12px 16px",
      border: `1px solid ${color}22`,
    }}>
      <div style={{ textAlign: "center", minWidth: "56px" }}>
        <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1, color }}>{pct}</div>
        <div style={{ fontSize: "10px", color: "#888", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "2px" }}>/ 100</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {label} evidence
          </span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px" }} />
        </div>
      </div>
    </div>
  );
}

function ifBadge(value: number): React.ReactNode {
  const isGold   = value >= 5;
  const isSilver = value >= 3;
  const bg     = isGold ? "#fef3c7" : isSilver ? "#f1f5f9" : "#f9fafb";
  const color  = isGold ? "#92400e" : isSilver ? "#475569" : "#6b7280";
  const border = isGold ? "#fde68a" : isSilver ? "#cbd5e1" : "#e5e7eb";
  const label  = isGold ? "Gold" : isSilver ? "Silver" : "Low";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px", background: bg, color, border: `1px solid ${border}` }}>
        {label}
      </span>
      <span>{value.toFixed(3)}</span>
    </span>
  );
}

function stars(value: number | null): React.ReactNode {
  if (!value) return null;
  const v = Math.round(Math.max(1, Math.min(5, value)));
  return (
    <>
      {"★".repeat(v)}
      <span style={{ color: "#ddd" }}>{"★".repeat(5 - v)}</span>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminArticleLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [articleResult, eventsResult, authorLinksResult, specialtyResult, subspecialtiesList] = await Promise.all([
    admin.from("articles").select("*").eq("id", id).maybeSingle(),
    admin.from("article_events").select("*").eq("article_id", id).order("sequence", { ascending: true }),
    admin.from("article_authors").select("author_id, position, authors(author_score, department, hospital, city, state, country, verified_by)").eq("article_id", id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("article_specialties").select("specialty, specialty_match, scored_by, scored_at, source").eq("article_id", id).eq("specialty", ACTIVE_SPECIALTY).maybeSingle(),
    getSubspecialties(ACTIVE_SPECIALTY),
  ]);

  const article = articleResult.data;
  if (!article) notFound();

  const specialtyRow = specialtyResult.data as {
    specialty: string;
    specialty_match: boolean | null;
    scored_by: string | null;
    scored_at: string | null;
    source: string | null;
  } | null;

  // Cast for typed access
  const a = article as unknown as ArticleData;

  // Raw article for fields not on ArticleData
  const raw = article as Record<string, unknown>;

  // Map position → author_id and author_score for linking author names + scores
  const authorIdByPosition = new Map(
    (authorLinksResult.data ?? []).map((r) => [r.position as number, r.author_id as string])
  );
  type AuthorGeo = { department: string | null; hospital: string | null; city: string | null; state: string | null; country: string | null; verified_by: string | null };
  type LinkedAuthorRow = { position: number; author_id: string; authors: { author_score: number | null } & AuthorGeo | null };

  const authorScoreByPosition = new Map(
    (authorLinksResult.data ?? [])
      .filter((r) => (r as unknown as LinkedAuthorRow).authors?.author_score != null)
      .map((r) => [r.position as number, (r as unknown as LinkedAuthorRow).authors!.author_score as number])
  );
  const authorGeoByPosition = new Map(
    (authorLinksResult.data ?? []).map((r) => [
      r.position as number,
      (r as unknown as LinkedAuthorRow).authors ?? null,
    ])
  );

  const events = (eventsResult.data ?? []) as {
    id: string;
    event_type: string;
    payload: P;
    created_at: string;
  }[];

  // ── PubMed tab ──────────────────────────────────────────────────────────────

  const pubmedTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <ArticleStamkort article={a} authorIdByPosition={authorIdByPosition} authorScoreByPosition={authorScoreByPosition} authorGeoByPosition={authorGeoByPosition} />
    </div>
  );

  // ── Berigelse tab ───────────────────────────────────────────────────────────

  const isEnriched = !!a.enriched_at;
  const pico = a.pico as { population?: string; intervention?: string; comparison?: string; outcome?: string } | null;
  const citationsUrl = `https://europepmc.org/search?query=cites:MED:${a.pubmed_id}`;

  const berigelseTab = (
    <div style={{ padding: "4px 0 80px" }}>
      {/* Evidence Score */}
      {a.evidence_score != null && (
        <Card>
          <CardHeader label="Evidence Score" />
          <CardBody>
            <EvidenceScore value={a.evidence_score} />
          </CardBody>
        </Card>
      )}

      {/* Klassifikation */}
      <Card>
        <CardHeader label="Klassifikation" />
        <CardBody>
          <CardKVRow label="Article type" value={(raw.article_type as string | null) ?? "—"} />
          <CardKVRow label="Subspecialty" value={
            (() => {
              const sub = a.subspecialty_ai;
              const tags: string[] = Array.isArray(sub)
                ? sub
                : typeof sub === "string" && sub.startsWith("{") && sub.endsWith("}")
                  ? sub.slice(1, -1).split(",").map((s: string) => s.replace(/^"|"$/g, "").trim()).filter(Boolean)
                  : sub
                    ? [sub as string]
                    : [];
              return tags.length > 0 ? tags.join(", ") : "—";
            })()
          } />
          <CardKVRow label="Specialty" value={
            specialtyRow?.specialty_match === true
              ? specialtyLabel(specialtyRow.specialty)
              : specialtyRow?.specialty_match === false
                ? <Badge color="red">Rejected</Badge>
                : <Badge color="gray">Pending</Badge>
          } />
        </CardBody>
      </Card>

      {/* Bibliometri */}
      <Card>
        <CardHeader label="Bibliometri" />
        <CardBody>
          <CardKVRow label="Impact Factor" value={a.impact_factor != null ? ifBadge(a.impact_factor) : "—"} />
          <CardKVRow label="Journal H-index" value={a.journal_h_index != null ? String(a.journal_h_index) : "—"} />
          <CardKVRow label="Citation Count" value={
            <a href={citationsUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: "#1a6eb5", textDecoration: "none" }}>
              {a.citation_count ?? "—"}{a.citation_count != null ? " ↗" : ""}
            </a>
          } />
        </CardBody>
      </Card>

      {/* AI Summary */}
      {isEnriched && a.short_resume && (
        <Card>
          <CardHeader label="AI Summary" green />
          <CardBody>
            <div style={{ fontSize: "15px", lineHeight: 1.75, color: "#1a1a1a" }}>
              {a.short_resume}
            </div>
            <div style={{ display: "flex", gap: "32px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e8f0e8" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>News Value</div>
                <div style={{ fontSize: "18px", letterSpacing: "2px", color: "#f4a100" }}>
                  {stars(a.news_value)}
                </div>
              </div>
              {a.clinical_relevance && (
                <div>
                  <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Clinical Relevance</div>
                  <span style={{
                    display: "inline-block", fontSize: "12px",
                    background: a.clinical_relevance.toLowerCase().includes("practice") ? "#fff3e0" : "#e8f4e8",
                    color:      a.clinical_relevance.toLowerCase().includes("practice") ? "#e65100"  : "#2d7a2d",
                    padding: "4px 12px", borderRadius: "20px", fontWeight: 600,
                  }}>
                    {a.clinical_relevance}
                  </span>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* PICO */}
      {isEnriched && pico && (pico.population || pico.intervention || pico.comparison || pico.outcome) && (
        <Card>
          <CardHeader label="PICO" green />
          <CardBody>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {([
                { label: "Population",   value: pico.population },
                { label: "Intervention", value: pico.intervention },
                { label: "Comparison",   value: pico.comparison },
                { label: "Outcome",      value: pico.outcome },
              ] as { label: string; value: string | undefined }[])
                .filter((p) => p.value)
                .map((p) => (
                  <div key={p.label} style={{ background: "#f9fafb", borderRadius: "8px", padding: "14px", border: "1px solid #eef2f7" }}>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px", fontWeight: 600 }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: 1.5, color: "#2a2a2a" }}>{p.value}</div>
                  </div>
                ))
              }
            </div>
          </CardBody>
        </Card>
      )}

      {/* Specialty scoring */}
      <Card>
        <CardHeader label="Specialty scoring" />
        <CardBody>
          <CardKVRow label="Specialty match" value={
            specialtyRow?.specialty_match === true ? <Badge color="green">Approved</Badge>
            : specialtyRow?.specialty_match === false ? <Badge color="red">Rejected</Badge>
            : <Badge color="gray">Pending</Badge>
          } />
          <CardKVRow label="Source" value={specialtyRow?.source ?? "—"} />
          <CardKVRow label="Model" value={specialtyRow?.scored_by ?? "—"} />
          {specialtyRow?.specialty_match !== null && (
            <CardKVRow label="Scored at" value={specialtyRow?.scored_at ? fmt(specialtyRow.scored_at) : "—"} />
          )}
        </CardBody>
      </Card>

      {/* Redigering */}
      <Card>
        <CardHeader label="Redigering" />
        <CardBody>
          <ArticleEditableFields
            articleId={id}
            initialTags={[]}
            initialSpecialtyMatch={specialtyRow?.specialty_match ?? null}
            initialSpecialty={specialtyRow?.specialty ?? ACTIVE_SPECIALTY}
            initialSubspecialties={(Array.isArray(a.subspecialty_ai) ? a.subspecialty_ai : []) as string[]}
            subspecialties={subspecialtiesList}
          />
        </CardBody>
      </Card>

      {/* Subspecialer */}
      {(a.subspecialty_ai ||
        a.patient_population || a.time_to_read != null || a.full_text_available != null ||
        a.trial_registration || (raw.geo_region as string | null)) && (() => {
        const POPULATION_COLORS: Record<string, { bg: string; color: string; border: string }> = {
          adult:         { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
          pediatric:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
          neonatal:      { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
          mixed:         { bg: "#faf5ff", color: "#7c3aed", border: "#ddd6fe" },
          not_specified: { bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
        };

        const LANG_NAMES: Record<string, string> = {
          eng: "English", fre: "French",  ger: "German",
          spa: "Spanish", ita: "Italian", por: "Portuguese",
          chi: "Chinese", jpn: "Japanese", rus: "Russian",
        };

        type ClsRow = [string, React.ReactNode];
        const clsFr = (label: string, value: React.ReactNode | null | undefined): ClsRow | null => {
          if (value === null || value === undefined) return null;
          return [label, value];
        };

        // subspecialty_ai is TEXT[] — Supabase may return JS array or PG literal
        const subTags: string[] = Array.isArray(a.subspecialty_ai)
          ? a.subspecialty_ai
          : typeof a.subspecialty_ai === "string" && a.subspecialty_ai.startsWith("{") && a.subspecialty_ai.endsWith("}")
            ? a.subspecialty_ai.slice(1, -1).split(",").map((s: string) => s.replace(/^"|"$/g, "").trim()).filter(Boolean)
            : a.subspecialty_ai
              ? [a.subspecialty_ai]
              : [];

        const aiRows: ClsRow[] = [
          clsFr("Subspecialty", subTags.length > 0 ? subTags.join(", ") : null),
          clsFr("Model", a.subspecialty_model_version ? `v${a.subspecialty_model_version}` : null),
        ].filter((r): r is ClsRow => r !== null);

        const popStyle = a.patient_population
          ? POPULATION_COLORS[a.patient_population.toLowerCase()] ?? { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" }
          : null;

        const pmcFullTextUrl = a.pmc_id
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${a.pmc_id}/`
          : null;

        const trialUrl = a.trial_registration
          ? `https://clinicaltrials.gov/study/${a.trial_registration}`
          : null;

        const metaRows: ClsRow[] = [
          a.time_to_read != null ? clsFr("Time to Read", `${a.time_to_read} min`) : null,
          ["Patient Pop.", a.patient_population
            ? (
                <span style={{
                  fontSize: "12px", fontWeight: 600, borderRadius: "4px", padding: "2px 8px",
                  background: popStyle!.bg, color: popStyle!.color, border: `1px solid ${popStyle!.border}`,
                }}>
                  {a.patient_population}
                </span>
              )
            : "—"
          ] as ClsRow,
          clsFr("Full Text", a.full_text_available
            ? pmcFullTextUrl
              ? <a href={pmcFullTextUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#15803d", fontWeight: 600, textDecoration: "none" }}>Tilgængelig ↗</a>
              : <span style={{ color: "#15803d", fontWeight: 600 }}>Tilgængelig</span>
            : a.full_text_available === false
              ? <span style={{ color: "#888" }}>Kun abstract</span>
              : null
          ),
          clsFr("Region", raw.geo_region as string | null),
          ["Trial Reg.", a.trial_registration
            ? (
                <a href={trialUrl!} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                  {a.trial_registration} ↗
                </a>
              )
            : "—"
          ] as ClsRow,
          a.language
            ? clsFr("Language", LANG_NAMES[a.language] ?? a.language.toUpperCase())
            : null,
        ].filter((r): r is ClsRow => r !== null);

        return (
          <Card>
            <CardHeader label="Subspecialer" />
            <CardBody>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, fontSize: "14px" }}>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7c3aed", marginBottom: "8px" }}>
                    AI-klassificeret
                  </div>
                  {aiRows.map(([label, value]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                      <span style={{ color: "#888" }}>{label}</span>
                      <span style={{ color: "#1a1a1a" }}>{value}</span>
                    </div>
                  ))}
                  {a.subspecialty_reason && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#666", fontStyle: "italic", lineHeight: 1.5 }}>
                      {a.subspecialty_reason}
                    </div>
                  )}
                </div>
                {metaRows.length > 0 && (
                  <div style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: "20px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                      Metadata
                    </div>
                    {metaRows.map(([label, value]) => (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5", alignItems: "center" }}>
                        <span style={{ color: "#888" }}>{label}</span>
                        <span style={{ color: "#1a1a1a" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })()}

      {/* Kondensering */}
      <Card>
        <CardHeader label="Kondensering" />
        <CardBody>
          {!(raw.condensed_at as string | null) ? (
            <div style={{ fontSize: "13px", color: "#aaa" }}>Ikke kondenseret endnu</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, fontSize: "14px" }}>
              {/* Left column: Tekst */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#059669", marginBottom: "8px" }}>
                  Tekst
                </div>
                {a.short_headline && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Headline</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4 }}>{a.short_headline}</div>
                  </div>
                )}
                {a.short_resume && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Resumé</div>
                    <div style={{ fontSize: "14px", color: "#2a2a2a", lineHeight: 1.6 }}>{a.short_resume}</div>
                  </div>
                )}
                {a.bottom_line && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Bottom Line</div>
                    <div style={{ background: "#f9fafb", borderLeft: "3px solid #7c3aed", padding: "10px 12px", fontSize: "14px", fontStyle: "italic", color: "#2a2a2a", lineHeight: 1.5 }}>
                      {a.bottom_line}
                    </div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5", marginTop: "4px" }}>
                  <span style={{ color: "#888" }}>Model</span>
                  <span style={{ color: "#1a1a1a" }}>{a.condensed_model_version ? `v${a.condensed_model_version}` : "—"}</span>
                </div>
              </div>

              {/* Right column: PICO & Sample */}
              {(() => {
                const cndAuthors = (Array.isArray(a.authors) ? a.authors : []) as { foreName?: string; lastName?: string }[];
                const firstName = cndAuthors.length > 0
                  ? [cndAuthors[0].foreName, cndAuthors[0].lastName].filter(Boolean).join(" ")
                  : null;
                const lastAuthor = cndAuthors.length > 1 ? cndAuthors[cndAuthors.length - 1] : null;
                const lastName = lastAuthor
                  ? [lastAuthor.foreName, lastAuthor.lastName].filter(Boolean).join(" ")
                  : null;
                const firstAuthorId = authorIdByPosition.get(1) ?? null;
                const lastAuthorId = cndAuthors.length > 1 ? (authorIdByPosition.get(cndAuthors.length) ?? null) : null;

                const authorLink = (name: string, id: string | null) =>
                  id
                    ? <a href={`/admin/authors/${id}`} style={{ color: "#1a6eb5", textDecoration: "none" }}>{name}</a>
                    : <>{name}</>;

                return (
                  <div style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: "20px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                      PICO & Sample
                    </div>
                    {a.pico_population == null && a.pico_intervention == null && a.pico_comparison == null && a.pico_outcome == null ? (
                      <div style={{ fontSize: "13px", color: "#aaa", fontStyle: "italic", marginBottom: "8px" }}>Ikke relevant</div>
                    ) : (
                      <>
                        {[
                          { label: "Population", value: a.pico_population },
                          { label: "Intervention", value: a.pico_intervention },
                          { label: "Comparison", value: a.pico_comparison },
                          { label: "Outcome", value: a.pico_outcome },
                        ].map((p) => (
                          <div key={p.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                            <span style={{ color: "#888" }}>{p.label}</span>
                            <span style={{ color: p.value ? "#1a1a1a" : "#aaa" }}>{p.value ?? "—"}</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5", marginTop: "4px" }}>
                      <span style={{ color: "#888" }}>Sample Size</span>
                      <span style={{ color: a.sample_size != null ? "#1a1a1a" : "#aaa", fontWeight: a.sample_size != null ? 600 : 400 }}>
                        {a.sample_size != null ? `N = ${a.sample_size.toLocaleString("da-DK")}` : "—"}
                      </span>
                    </div>
                    {firstName && (
                      <>
                        {lastName ? (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                              <span style={{ color: "#888" }}>Første forfatter</span>
                              <span style={{ color: "#1a1a1a" }}>{authorLink(firstName, firstAuthorId)}</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                              <span style={{ color: "#888" }}>Sidste forfatter</span>
                              <span style={{ color: "#1a1a1a" }}>{authorLink(lastName, lastAuthorId)}</span>
                            </div>
                          </>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                            <span style={{ color: "#888" }}>Forfatter</span>
                            <span style={{ color: "#1a1a1a" }}>{authorLink(firstName, firstAuthorId)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  // ── Geo tab ─────────────────────────────────────────────────────────────────

  const _firstAuthor = (raw.authors as Array<{ affiliations?: string[]; affiliation?: string | null }>)?.[0];
  const firstAuthorRawAffiliation = _firstAuthor?.affiliations?.[0] ?? _firstAuthor?.affiliation ?? null;

  const geoTab = (
    <div style={{ padding: "4px 0 80px" }}>
      {/* Rå affiliationstekst */}
      <Card>
        <CardHeader label="Rå affiliationstekst (første forfatter)" />
        <CardBody>
          {firstAuthorRawAffiliation ? (
            <div style={{ fontSize: "13px", lineHeight: 1.6, color: "#2a2a2a", fontFamily: "monospace", background: "#f8f9fb", borderRadius: "6px", padding: "12px", border: "1px solid #e5e7eb", wordBreak: "break-word" }}>
              {firstAuthorRawAffiliation}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#aaa" }}>Ingen affiliationstekst</div>
          )}
        </CardBody>
      </Card>

      {/* GeoCard */}
      <GeoCard
        articleId={id}
        geoContinent={raw.geo_continent as string | null}
        geoRegion={raw.geo_region as string | null}
        geoCountry={raw.geo_country as string | null}
        geoState={raw.geo_state as string | null}
        geoCity={raw.geo_city as string | null}
        geoDepartment={raw.geo_department as string | null}
        geoInstitution={raw.geo_institution as string | null}
        locationConfidence={raw.location_confidence as string | null}
        aiLocationAttempted={raw.ai_location_attempted as boolean | null}
        locationParsedAt={raw.location_parsed_at as string | null}
      />
    </div>
  );

  // ── System tab ──────────────────────────────────────────────────────────────

  const importedDisplay = (() => {
    const d = new Date(a.imported_at);
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} at ${time}`;
  })();

  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/`;
  const pmcId = raw.pmc_id as string | null;

  const systemTab = (
    <div style={{ padding: "4px 0 80px" }}>
      {/* Import */}
      <Card>
        <CardHeader label="Import" />
        <CardBody>
          <CardKVRow label="Circle" value={
            (raw.circle as number | null) != null
              ? <Badge color="blue">{`Circle ${raw.circle}`}</Badge>
              : "—"
          } />
          <CardKVRow label="Imported at" value={importedDisplay} />
          <CardKVRow label="Specialty Tag Approval" value={(() => {
            const m = raw.approval_method as string | null;
            if (m === "human")        return <Badge color="green">Approved by Editor</Badge>;
            if (m === "mesh_auto_tag") return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}>Auto-approved by MeSH-terms</span>;
            if (m === "journal")      return <Badge color="blue">Auto-approved by Journal</Badge>;
            return <span style={{ color: "#9ca3af" }}>Pending</span>;
          })()} />
          <CardKVRow label="Source ID" value={(raw.source_id as string | null) ?? "—"} />
        </CardBody>
      </Card>

      {/* IDs */}
      <Card>
        <CardHeader label="IDs" />
        <CardBody>
          <CardKVRow label="Article UUID" value={
            <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{a.id}</span>
          } />
          <CardKVRow label="PubMed ID" value={
            <a href={pubmedUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: "#1a6eb5", textDecoration: "none" }}>
              PMID {a.pubmed_id} ↗
            </a>
          } />
          {pmcId && (
            <CardKVRow label="PMC ID" value={
              <a href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`} target="_blank" rel="noopener noreferrer"
                style={{ color: "#1a6eb5", textDecoration: "none" }}>
                {pmcId} ↗
              </a>
            } />
          )}
        </CardBody>
      </Card>

      {/* PubMed Sync */}
      <Card>
        <CardHeader label="PubMed Sync" />
        <CardBody>
          <CardKVRow
            label="Last synced"
            value={
              (raw.pubmed_synced_at as string | null)
                ? fmt(raw.pubmed_synced_at as string)
                : <span style={{ color: "#9ca3af" }}>Not yet synced</span>
            }
          />
          <CardKVRow
            label="Retracted"
            value={
              raw.retracted === true
                ? <Badge color="red">Yes</Badge>
                : <Badge color="gray">No</Badge>
            }
          />
          <CardKVRow
            label="Authors changed"
            value={
              raw.authors_changed === true
                ? <Badge color="orange">Yes</Badge>
                : <Badge color="gray">No</Badge>
            }
          />
          {raw.authors_changed === true && Array.isArray(raw.authors_raw_new) && (
            <CardKVRow
              label="New authors data"
              value={
                <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                  {(raw.authors_raw_new as unknown[]).length} authors pending review
                </span>
              }
            />
          )}
        </CardBody>
      </Card>
    </div>
  );

  // ── Historik tab ────────────────────────────────────────────────────────────

  const SECTIONS: { title: string; types: string[]; alwaysShow?: boolean }[] = [
    { title: "Indlæsning af artikel",    types: ["imported"],      alwaysShow: true },
    { title: "Indlæsning af forfattere", types: ["author_linked"], alwaysShow: true },
    { title: "Speciale scoring",         types: ["enriched"] },
    { title: "Auto-Tagging",            types: ["auto_tagged"] },
    { title: "Validering",               types: ["lab_decision"] },
    { title: "Bibliometri",              types: ["citation_count_updated"] },
  ];

  const grouped = SECTIONS.map((s) => ({
    ...s,
    events: events.filter((ev) => s.types.includes(ev.event_type)),
  })).filter((s) => s.alwaysShow || s.events.length > 0);

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

        {/* Article header — title only */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "24px", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
            {a.title}
          </h1>
          {raw.retracted === true && (
            <div style={{
              marginTop: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "6px 12px",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#b91c1c" }}>
                ⚠ RETRACTED
              </span>
              <span style={{ fontSize: "12px", color: "#ef4444" }}>
                This article has been retracted from PubMed
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px" }}>
        <AdminArticleTabs
          pubmed={pubmedTab}
          berigelse={berigelseTab}
          geo={geoTab}
          system={systemTab}
          historik={historikTab}
        />
      </div>
    </div>
  );
}
