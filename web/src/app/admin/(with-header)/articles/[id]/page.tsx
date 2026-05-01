import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import type { ArticleData } from "@/components/articles/ArticleStamkort";
import CollapseAuthors from "@/components/articles/CollapseAuthors";
import CopyButton from "@/components/articles/CopyButton";
import AdminArticleTabs from "./AdminArticleTabs";
import ArticleEditableFields from "./ArticleEditableFields";
import ArticleNoteTab from "./ArticleNoteTab";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { getArticleTypes } from "@/lib/lab/article-type-options";
import GeoCard from "./GeoCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

function specialtyLabel(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function parseSubArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string" && val.startsWith("{") && val.endsWith("}"))
    return val.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
  if (val) return [val as string];
  return [];
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g,            (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English", fre: "French",  ger: "German",
  spa: "Spanish", ita: "Italian", por: "Portuguese",
  chi: "Chinese", jpn: "Japanese", rus: "Russian",
};

interface AuthorRaw { lastName?: string; foreName?: string; affiliation?: string | null; affiliations?: string[] | null; orcid?: string | null }
interface MeshTerm  { descriptor?: string; major?: boolean; qualifiers?: string[] }
interface Grant     { grantId?: string | null; agency?: string | null }
function cast<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

// ── Timeline colours ──────────────────────────────────────────────────────────

const COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  imported:               { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff", label: "Article imported" },
  enriched:               { dot: "#8b5cf6", border: "#ddd6fe", bg: "#f5f3ff", label: "AI Enrichment" },
  lab_decision:           { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4", label: "Lab" },
  feedback:               { dot: "#f59e0b", border: "#fde68a", bg: "#fffbeb", label: "Feedback" },
  status_changed:         { dot: "#f97316", border: "#fed7aa", bg: "#fff7ed", label: "Status changed" },
  verified:               { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4", label: "Verified" },
  author_linked:          { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff", label: "Authors linked to article" },
  quality_check:          { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb", label: "Quality Check" },
  auto_tagged:            { dot: "#0891b2", border: "#a5f3fc", bg: "#ecfeff", label: "Auto-Tagged" },
  citation_count_updated:    { dot: "#0891b2", border: "#a5f3fc", bg: "#ecfeff", label: "Citation count updated" },
  condensation_text_scored:  { dot: "#059669", border: "#a7f3d0", bg: "#f0fdf4", label: "TEXT CONDENSED" },
  condensation_sari_scored:  { dot: "#7c3aed", border: "#ddd6fe", bg: "#f5f3ff", label: "SARI SCORED" },
  condensation_validated:    { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4", label: "CONDENSATION VALIDATED" },
  geo_updated:               { dot: "#14b8a6", border: "#99f6e4", bg: "#f0fdfa", label: "Geo updated" },
};
const FALLBACK_COLOR = { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb", label: "Event" };

// ── UI primitives ─────────────────────────────────────────────────────────────

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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", marginBottom: "12px", overflow: "hidden" }}>
      {children}
    </div>
  );
}

function CardHeader({ label, green }: { label: string; green?: boolean }) {
  return (
    <div style={{ background: green ? "#f0f7ee" : "#EEF2F7", borderBottom: `1px solid ${green ? "#c8e6c0" : "#dde3ed"}`, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: green ? "#3a7d44" : "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 24px" }}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#5a6a85", marginBottom: "8px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
      {children}
    </div>
  );
}

function DescriptionRow({ label, value, description }: {
  label: string;
  value: React.ReactNode;
  description: string;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      padding: "7px 0",
      borderBottom: "1px solid #f5f5f5",
      gap: "16px",
      alignItems: "start",
      minHeight: 0,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: "8px",
        alignItems: "start",
      }}>
        <span style={{ color: "#888", fontSize: "13px" }}>{label}</span>
        <span style={{
          color: value !== null && value !== undefined && value !== "—" ? "#1a1a1a" : "#bbb",
          fontSize: "14px",
          lineHeight: 1.5,
        }}>
          {value ?? "—"}
        </span>
      </div>
      <span style={{
        color: "#9ca3af",
        fontSize: "12px",
        lineHeight: 1.5,
        borderLeft: "1px solid #f0f0f0",
        paddingLeft: "16px",
      }}>
        {description}
      </span>
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
      {circle != null && <KV label="Circle" value={<Badge color="blue">{`Circle ${circle}`}</Badge>} />}
      {p.status != null && <KV label="Status" value={<Badge color={p.status === "approved" ? "green" : "orange"}>{String(p.status)}</Badge>} />}
      {Array.isArray(p.specialty_tags) && (p.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.specialty_tags as string[]).map((s) => <Badge key={s} color="blue">{specialtyLabel(s)}</Badge>)}
          </span>
        } />
      )}
      <KV label="Approval method" value={approvalBadge} />
      {circle === 2 && p.source_id != null && <KV label="Source ID" value={String(p.source_id)} />}
    </div>
  );
}

function EnrichedCard({ p }: { p: P }) {
  const conf   = p.specialty_confidence as number | null;
  const module = p.module as string | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {module && <KV label="Modul" value={<Badge color="purple">{module}</Badge>} />}
      {p.ai_decision != null && <KV label="AI beslutning" value={<Badge color={p.ai_decision === "approved" ? "green" : "red"}>{String(p.ai_decision)}</Badge>} />}
      {conf != null && <KV label="Confidence" value={`${conf}%`} />}
      {p.reason != null && <KV label="Reason" value={String(p.reason)} />}
      {Array.isArray(p.subspecialty) && (p.subspecialty as string[]).length > 0 && (
        <KV label="Subspecialty" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.subspecialty as string[]).map((s) => <Badge key={s} color="purple">{s}</Badge>)}
          </span>
        } />
      )}
      {p.article_type != null && <KV label="Article type" value={<Badge color="blue">{String(p.article_type)}</Badge>} />}
      {p.confidence != null && p.article_type != null && <KV label="Confidence" value={`${p.confidence}%`} />}
      {p.version != null && <KV label="Version" value={String(p.version)} />}
      {Array.isArray(p.specialty_tags) && (p.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty tags" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(p.specialty_tags as string[]).map((s) => <Badge key={s} color="purple">{specialtyLabel(s)}</Badge>)}
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
  const verdictColor  = (v: string) => v === "approved" || v === "relevant" ? "green" : v === "unsure" ? "orange" : "red";
  const statusColor   = (v: string) => v === "approved" ? "green" : v === "rejected" ? "red" : "orange";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Modul"      value={p.module as string | null} />
      <KV label="Beslutning" value={editorVerdict ? <Badge color={verdictColor(editorVerdict)}>{editorVerdict}</Badge> : null} />
      {aiVerdict && (
        <KV label="AI beslutning" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Badge color={verdictColor(aiVerdict)}>{aiVerdict}</Badge>
            {agree ? <span style={{ fontSize: "11px", color: "#15803d" }}>✓ enig</span> : <span style={{ fontSize: "11px", color: "#b91c1c" }}>✗ uenig</span>}
          </span>
        } />
      )}
      {confidence != null && <KV label="AI confidence" value={`${confidence.toFixed(1)}%`} />}
      {p.disagreement_reason ? <KV label="Årsag til uenighed" value={<span style={{ color: "#b91c1c" }}>{String(p.disagreement_reason)}</span>} /> : null}
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
      <KV label="Uge / År"          value={p.week != null ? `Uge ${p.week}, ${p.year}` : null} />
      {p.decision ? <KV label="Beslutning" value={<Badge color={p.decision === "selected" ? "green" : "gray"}>{String(p.decision)}</Badge>} /> : null}
    </div>
  );
}

function StatusChangedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.from ? <KV label="Fra" value={<Badge color="gray">{String(p.from)}</Badge>} /> : null}
      {p.to ? <KV label="Til" value={<Badge color={p.to === "approved" ? "green" : p.to === "rejected" ? "red" : "orange"}>{String(p.to)}</Badge>} /> : null}
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
      {passed != null && <KV label="Resultat" value={<Badge color={passed ? "green" : "red"}>{passed ? "Passed" : "Failed"}</Badge>} />}
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

function TextCondensedCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.version != null && <KV label="Version" value={String(p.version)} />}
    </div>
  );
}

function SariScoredCard({ p }: { p: P }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {(p.sari_version ?? p.version) != null && <KV label="Version" value={String(p.sari_version ?? p.version)} />}
    </div>
  );
}

function CondensationValidatedCard({ p }: { p: P }) {
  const decision = p.decision as string | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.module != null && <KV label="Module" value={<Badge color="gray">{String(p.module)}</Badge>} />}
      {decision != null && <KV label="Decision" value={<Badge color={decision === "approved" ? "green" : "red"}>{decision}</Badge>} />}
    </div>
  );
}

function GeoUpdatedCard({ p }: { p: P }) {
  const source = p.source as string | null;
  const fields = Array.isArray(p.fields_updated) ? (p.fields_updated as string[]) : [];
  const confidence = p.parser_confidence as string | null;
  const prev = p.previous as Record<string, string | null> | null;
  const next = p.new as Record<string, string | null> | null;

  const SOURCE_BADGE: Record<string, string> = {
    human:           "green",
    ror_enriched:    "green",
    parser_openalex: "blue",
    parser_pubmed:   "purple",
    parser:          "purple",
    enrichment:      "blue",
    manual:          "gray",
  };
  const sourceColor = source ? (SOURCE_BADGE[source] ?? "gray") : "gray";

  const cityChanged  = fields.includes("geo_city");
  const countryChanged = fields.includes("geo_country");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {source && (
        <KV label="Source" value={<Badge color={sourceColor}>{source}</Badge>} />
      )}
      {fields.length > 0 && (
        <KV label="Fields updated" value={
          <span style={{ fontSize: "12px", color: "#374151" }}>{fields.join(", ")}</span>
        } />
      )}
      {confidence && (
        <KV label="Parser confidence" value={<Badge color={confidence === "high" ? "green" : "orange"}>{confidence}</Badge>} />
      )}
      {(cityChanged || countryChanged) && prev && next && (
        <KV label="Location" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span style={{ color: "#9ca3af" }}>
              {[prev.geo_city, prev.geo_country].filter(Boolean).join(", ") || "—"}
            </span>
            <span style={{ color: "#9ca3af" }}>→</span>
            <span style={{ color: "#1a1a1a", fontWeight: 600 }}>
              {[next.geo_city, next.geo_country].filter(Boolean).join(", ") || "—"}
            </span>
          </span>
        } />
      )}
    </div>
  );
}

function EventCard({ eventType, payload }: { eventType: string; payload: P }) {
  switch (eventType) {
    case "imported":              return <ImportedCard           p={payload} />;
    case "enriched":              return <EnrichedCard           p={payload} />;
    case "lab_decision":          return <LabDecisionCard        p={payload} />;
    case "feedback":              return <FeedbackCard           p={payload} />;
    case "status_changed":        return <StatusChangedCard      p={payload} />;
    case "verified":              return <VerifiedCard           p={payload} />;
    case "author_linked":         return <AuthorLinkedCard       p={payload} />;
    case "quality_check":         return <QualityCheckCard       p={payload} />;
    case "auto_tagged":              return <AutoTaggedCard            p={payload} />;
    case "impact_factor_updated":    return <ImpactFactorUpdatedCard   p={payload} />;
    case "citation_count_updated":   return <CitationCountUpdatedCard  p={payload} />;
    case "condensation_text_scored": return <TextCondensedCard         p={payload} />;
    case "condensation_sari_scored":  return <SariScoredCard            p={payload} />;
    case "condensation_validated":   return <CondensationValidatedCard p={payload} />;
    case "geo_updated":              return <GeoUpdatedCard            p={payload} />;
    default:
      return <pre style={{ fontSize: "11px", color: "#6b7280", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(payload, null, 2)}</pre>;
  }
}

// ── Berigelse helpers ─────────────────────────────────────────────────────────


function ifBadge(value: number): React.ReactNode {
  const isGold   = value >= 5;
  const isSilver = value >= 3;
  const bg     = isGold ? "#fef3c7" : isSilver ? "#f1f5f9" : "#f9fafb";
  const color  = isGold ? "#92400e" : isSilver ? "#475569" : "#6b7280";
  const border = isGold ? "#fde68a" : isSilver ? "#cbd5e1" : "#e5e7eb";
  const label  = isGold ? "Gold" : isSilver ? "Silver" : "Low";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px", background: bg, color, border: `1px solid ${border}` }}>{label}</span>
      <span>{value.toFixed(3)}</span>
    </span>
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

  const [articleResult, eventsResult, authorLinksResult, specialtyResult, subspecialtiesList, articleTypesList, geoMetaResult] = await Promise.all([
    admin.from("articles").select("*").eq("id", id).maybeSingle(),
    admin.from("article_events").select("*").eq("article_id", id).order("sequence", { ascending: true }),
    admin.from("article_authors").select("author_id, position, authors(author_score, department, hospital, city, state, country, verified_by)").eq("article_id", id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("article_specialties").select("specialty, specialty_match, scored_by, scored_at, source, specialty_confidence, specialty_reason").eq("article_id", id).eq("specialty", ACTIVE_SPECIALTY).maybeSingle(),
    getSubspecialties(ACTIVE_SPECIALTY),
    getArticleTypes(ACTIVE_SPECIALTY),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("article_geo_metadata").select("geo_confidence, parser_processed_at, parser_version, ai_processed_at, ai_model, ai_prompt_version, ai_changes, enriched_at, enriched_state_source, class_b_address_count").eq("article_id", id).maybeSingle(),
  ]);

  const article = articleResult.data;
  if (!article) notFound();

  const specialtyRow = specialtyResult.data as {
    specialty: string;
    specialty_match: boolean | null;
    scored_by: string | null;
    scored_at: string | null;
    source: string | null;
    specialty_confidence: number | null;
    specialty_reason: string | null;
  } | null;

  const a   = article as unknown as ArticleData;
  const raw = article as Record<string, unknown>;
  const geoMeta = (geoMetaResult as { data: Record<string, unknown> | null }).data ?? null;

  // Fetch all address rows from article_geo_addresses (Klasse A: 1 row, Klasse B: N rows)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: geoAddressRows } = await (admin as any)
    .from("article_geo_addresses")
    .select("id, position, city, state, country, region, continent, institution, institution2, institution3, institutions_overflow, department, department2, department3, departments_overflow, confidence, state_source, ai_action, ai_changes, ai_processed_at")
    .eq("article_id", id)
    .order("position", { ascending: true });

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
    (authorLinksResult.data ?? []).map((r) => [r.position as number, (r as unknown as LinkedAuthorRow).authors ?? null])
  );

  const events = (eventsResult.data ?? []) as { id: string; event_type: string; payload: P; created_at: string }[];

  const specialtyLabEvent = [...events]
    .filter((ev) => ev.event_type === "lab_decision" && (ev.payload as P).module === "specialty_tag")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const subspecialtyLabEvent = [...events]
    .filter((ev) => ev.event_type === "lab_decision" && (ev.payload as P).module === "subspecialty")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const articleTypeLabEvent = [...events]
    .filter((ev) => ev.event_type === "lab_decision" && (ev.payload as P).module === "article_type")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const pubmedUrl    = `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/`;
  const pmcId        = raw.pmc_id as string | null;
  const citationsUrl = `https://europepmc.org/search?query=cites:MED:${a.pubmed_id}`;
  const doiUrl       = a.doi ? `https://doi.org/${a.doi}` : null;

  const importedDisplay = (() => {
    const d = new Date(a.imported_at);
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} at ${time}`;
  })();

  // ── Article data ─────────────────────────────────────────────────────────────

  const authors   = cast<AuthorRaw>(a.authors);
  const meshTerms = cast<MeshTerm>(a.mesh_terms);
  const grants     = cast<Grant>(a.grants);
  const substances = cast<{ registryNumber?: string | null; name?: string | null }>(raw.substances);
  const abstract   = a.abstract ? decodeHtml(a.abstract) : null;

  const abstractSections = abstract
    ? abstract.split(/\n/).reduce<{ label: string; text: string }[]>((acc, line) => {
        const match = line.match(/^([A-Z][A-Z /]+):?\s+(.+)/);
        if (match) { acc.push({ label: match[1], text: match[2] }); }
        else if (acc.length > 0) { acc[acc.length - 1].text += " " + line; }
        else { acc.push({ label: "", text: line }); }
        return acc;
      }, [])
    : null;

  const publishedDisplay = (() => {
    if (!a.published_date) return a.published_year ? String(a.published_year) : null;
    const d = new Date(a.published_date);
    return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  })();

  const firstAuthorCitation = authors.length > 0
    ? `${authors[0].lastName ?? ""}${authors.length > 1 ? " et al." : ""}`
    : "";
  const citationSummary = authors.length > 0
    ? `${authors[0].lastName ?? ""}${authors.length > 1 ? " et al." : ""}, ${a.journal_abbr ?? a.journal_title ?? ""}`
    : null;
  const citationText = [
    firstAuthorCitation,
    a.title ? ` ${a.title}.` : "",
    a.journal_abbr ? ` ${a.journal_abbr}.` : "",
    publishedDisplay ? ` ${publishedDisplay};` : "",
    a.volume ?? "",
    a.issue ? `(${a.issue})` : "",
    a.article_number ? `:${a.article_number}.` : ".",
    doiUrl ? ` doi:${a.doi}` : "",
  ].filter(Boolean).join("");

  // ── PubMed tab ──────────────────────────────────────────────────────────────

  const pubmedTab = (
    <div style={{ padding: "4px 0 80px" }}>

      {/* Identifikation */}
      <Card>
        <CardHeader label="Identification" />
        <CardBody>
          <DescriptionRow
            label="PMID"
            value={<a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>{a.pubmed_id} ↗</a>}
            description="PubMed's unique identifier for this article. Use this ID to look up the article directly in PubMed."
          />
          <DescriptionRow
            label="DOI"
            value={a.doi && doiUrl ? <a href={doiUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>{a.doi} ↗</a> : null}
            description="Digital Object Identifier — a permanent link to the published article. More stable than a URL."
          />
          <DescriptionRow
            label="PMC ID"
            value={pmcId ? <a href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>{pmcId} ↗</a> : null}
            description="PubMed Central ID. Present only if the article is available as open-access full text in PMC."
          />
          <DescriptionRow
            label="Article number"
            value={a.article_number ?? null}
            description="Publisher-assigned article number, used instead of page numbers in many modern journals."
          />
          <DescriptionRow
            label="ISSN (print)"
            value={a.issn_print ?? null}
            description="International Standard Serial Number for the print edition of the journal."
          />
          <DescriptionRow
            label="ISSN (electronic)"
            value={a.issn_electronic ?? null}
            description="International Standard Serial Number for the online/electronic edition of the journal."
          />
        </CardBody>
      </Card>

      {/* Journal */}
      <Card>
        <CardHeader label="Journal" />
        <CardBody>
          <DescriptionRow
            label="Journal"
            value={a.journal_title ?? null}
            description="Full name of the journal in which the article was published."
          />
          <DescriptionRow
            label="Abbreviation"
            value={a.journal_abbr ?? null}
            description="Standard NLM abbreviation of the journal name, used in citations."
          />
          <DescriptionRow
            label="Volume"
            value={a.volume ?? null}
            description="Journal volume number for the issue containing this article."
          />
          <DescriptionRow
            label="Issue"
            value={a.issue ?? null}
            description="Issue number within the volume."
          />
          <DescriptionRow
            label="Published year"
            value={a.published_year != null ? String(a.published_year) : null}
            description="Year the article was published, as reported by the publisher."
          />
        </CardBody>
      </Card>

      {/* Datoer */}
      <Card>
        <CardHeader label="Dates" />
        <CardBody>
          <DescriptionRow
            label="Published"
            value={fmtPublished(a.published_date)}
            description="Full publication date as reported by the publisher. May differ from the PubMed indexing date."
          />
          <DescriptionRow
            label="PubMed date"
            value={fmtDate(raw.pubmed_date as string | null)}
            description="The date the article first appeared in PubMed search results (PubStatus: pubmed)."
          />
          <DescriptionRow
            label="Indexed at"
            value={fmtDate(raw.pubmed_indexed_at as string | null)}
            description="The date PubMed registered the article in its database (Entrez date). This is the date used for filtering in PulseFeeds."
          />
          <DescriptionRow
            label="Date completed"
            value={fmtDate(raw.date_completed as string | null)}
            description="The date PubMed completed full indexing of the article, including MeSH term assignment."
          />
          <DescriptionRow
            label="Modified at"
            value={fmtDate(raw.pubmed_modified_at as string | null)}
            description="The date the article's PubMed record was last modified. Useful for detecting corrections or retractions."
          />
        </CardBody>
      </Card>

      {/* Artikel */}
      <Card>
        <CardHeader label="Article" />
        <CardBody>
          <DescriptionRow
            label="Title"
            value={a.title}
            description="Full title of the article as recorded in PubMed."
          />
          <DescriptionRow
            label="Language"
            value={a.language ? (LANGUAGE_NAMES[a.language] ?? a.language.toUpperCase()) : null}
            description="Primary language of the article as recorded by PubMed."
          />
          <DescriptionRow
            label="Publication types"
            value={a.publication_types && a.publication_types.length > 0 ? a.publication_types.join(", ") : null}
            description="PubMed classification of the article format, e.g. Journal Article, Review, Clinical Trial. An article can have multiple types."
          />
          <DescriptionRow
            label="Keywords"
            value={a.keywords && a.keywords.length > 0 ? a.keywords.join(", ") : null}
            description="Author-supplied keywords describing the article's topics. Not controlled vocabulary — unlike MeSH terms."
          />
          <DescriptionRow
            label="COI statement"
            value={raw.coi_statement as string | null}
            description="Conflict of interest statement as provided by the authors or publisher."
          />
        </CardBody>
      </Card>

      {/* Abstract */}
      <Card>
        <CardHeader label="Abstract" />
        <CardBody>
          <DescriptionRow
            label="Abstract"
            value={null}
            description="Author-provided summary of the article. Structured abstracts are preserved with their section labels."
          />
          {abstract ? (
            abstractSections && abstractSections.some((s) => s.label) ? (
              <div style={{ marginTop: "8px" }}>
                {abstractSections.map((s, i) => (
                  <div key={i} style={{ marginBottom: i < abstractSections.length - 1 ? "14px" : 0 }}>
                    {s.label && (
                      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5a6a85", display: "block", marginBottom: "4px" }}>
                        {s.label}
                      </span>
                    )}
                    <span style={{ fontSize: "14px", lineHeight: 1.7, color: "#2a2a2a" }}>{s.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#2a2a2a", margin: "8px 0 0", whiteSpace: "pre-line" }}>{abstract}</p>
            )
          ) : null}
        </CardBody>
      </Card>

      {/* MeSH Terms */}
      <Card>
        <CardHeader label="MeSH Terms" />
        <CardBody>
          <DescriptionRow
            label="MeSH terms"
            value={null}
            description="Medical Subject Headings assigned by NLM indexers. Major topics are marked with an asterisk (*). Used for auto-tagging and specialty matching in PulseFeeds."
          />
          {meshTerms.length > 0 ? (
            <div style={{ marginTop: "8px" }}>
              {[...meshTerms]
                .sort((ma, mb) => (ma.descriptor ?? "").localeCompare(mb.descriptor ?? ""))
                .map((m, i) => (
                  <div key={i} style={{ fontSize: "14px", color: "#444", padding: "6px 0", borderBottom: i < meshTerms.length - 1 ? "1px solid #f5f5f5" : undefined }}>
                    {m.major
                      ? <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{m.descriptor}*</span>
                      : <span>{m.descriptor}</span>
                    }
                    {m.qualifiers && m.qualifiers.length > 0 && (
                      <span style={{ color: "#bbb" }}> / {m.qualifiers.join(" / ")}</span>
                    )}
                  </div>
                ))
              }
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>No MeSH terms</div>
          )}
        </CardBody>
      </Card>

      {/* Forfattere */}
      <Card>
        <CardHeader label="Authors" />
        <CardBody>
          <DescriptionRow
            label="First author"
            value={authors.length > 0
              ? `${authors[0].foreName ?? ""} ${authors[0].lastName ?? ""}${authors.length > 1 ? ` et al. (${authors.length} authors)` : ""}`.trim()
              : null}
            description="Author list as recorded in PubMed, with affiliations and ORCID identifiers where available. Links to author profiles within PulseFeeds where matched."
          />
          {authors.length > 0 ? (
            <div style={{ marginTop: "8px" }}>
              <CollapseAuthors authors={authors.map((au, i) => ({
                ...au,
                affiliation: null,
                id: authorIdByPosition?.get(i + 1) ?? undefined,
                author_score: authorScoreByPosition?.get(i + 1) ?? undefined,
                geo: authorGeoByPosition?.get(i + 1) ?? null,
              }))} />
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>No authors</div>
          )}
        </CardBody>
      </Card>

      {/* Funding */}
      <Card>
        <CardHeader label="Funding" />
        <CardBody>
          <DescriptionRow
            label="Grants"
            value={grants.length > 0 ? `${grants.length} grant${grants.length > 1 ? "s" : ""}` : null}
            description="Funding sources reported by the authors, including grant IDs and funding agencies. Sourced directly from PubMed's grant data."
          />
          {grants.length > 0 ? (
            <div style={{ marginTop: "8px" }}>
              {grants.map((g, i) => (
                <div key={i} style={{ fontSize: "14px", padding: "8px 0", borderBottom: i < grants.length - 1 ? "1px solid #f5f5f5" : undefined }}>
                  {g.grantId && <span style={{ fontWeight: 600 }}>{g.grantId}</span>}
                  {g.agency  && <span style={{ color: "#666" }}> — {decodeHtml(g.agency)}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>No funding data</div>
          )}
        </CardBody>
      </Card>

      {/* Substances */}
      <Card>
        <CardHeader label="Substances" />
        <CardBody>
          <DescriptionRow
            label="Substances"
            value={substances.length > 0 ? `${substances.length} substance${substances.length > 1 ? "s" : ""}` : null}
            description="Chemical substances and drugs mentioned in the article, from PubMed's MeSH chemical list. Includes registry numbers where available."
          />
          {substances.length > 0 ? (
            <div style={{ marginTop: "8px" }}>
              {substances.map((s, i) => (
                <div key={i} style={{ fontSize: "14px", padding: "6px 0", borderBottom: i < substances.length - 1 ? "1px solid #f5f5f5" : undefined, color: "#1a1a1a" }}>
                  {s.name}
                  {s.registryNumber && <span style={{ color: "#888" }}> — {s.registryNumber}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>No substance data</div>
          )}
        </CardBody>
      </Card>

      {/* Citation */}
      <Card>
        <CardHeader label="Citation" />
        <CardBody>
          <DescriptionRow
            label="Vancouver"
            value={citationSummary}
            description="Auto-generated Vancouver-style citation based on PubMed data. Click to copy."
          />
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "13px", lineHeight: 1.6, color: "#444", background: "#f9fafb", borderRadius: "6px", padding: "14px", border: "1px solid #eef2f7", fontFamily: "Georgia, serif" }}>
              {citationText}
            </div>
            <CopyButton text={citationText} />
          </div>
        </CardBody>
      </Card>

    </div>
  );

  // ── Classification tab ──────────────────────────────────────────────────────

  const classificationTab = (
    <div style={{ padding: "4px 0 80px" }}>

      {/* Specialty */}
      <Card>
        <CardHeader label="Specialty" />
        <CardBody>
          <DescriptionRow
            label="Specialty"
            value={specialtyRow?.specialty ? specialtyLabel(specialtyRow.specialty) : null}
            description="The medical specialty this article has been evaluated for."
          />
          <DescriptionRow
            label="Status"
            value={
              specialtyRow?.specialty_match === true ? <Badge color="green">Included</Badge>
              : specialtyRow?.specialty_match === false ? <Badge color="red">Excluded</Badge>
              : <Badge color="gray">Pending</Badge>
            }
            description="Whether this article is included in the specialty feed. Included = appears in feeds and newsletters. Excluded = filtered out. Pending = not yet scored."
          />
          <DescriptionRow
            label="Decision date"
            value={specialtyRow?.scored_at ? fmt(specialtyRow.scored_at) : null}
            description="The date the specialty decision was made for this article."
          />
          <DescriptionRow
            label="Decision method"
            value={(() => {
              const s = specialtyRow?.source ?? null;
              if (!s) return null;
              const labels: Record<string, string> = {
                ai_score:  "AI model",
                c1_filter: "Circle 1 — journal whitelist",
                c2_filter: "Circle 2 — affiliation filter",
                c4_filter: "Circle 4 — MeSH filter",
                manual:    "Manual — editor decision",
              };
              return labels[s] ?? s;
            })()}
            description="How the specialty decision was made — by AI model, journal whitelist, MeSH auto-tag, or human editor."
          />
          <DescriptionRow
            label="Scored by model"
            value={specialtyRow?.scored_by ?? null}
            description="The AI model version used to evaluate this article for the specialty, e.g. v10."
          />
          <DescriptionRow
            label="Validated by Lab"
            value={specialtyLabEvent
              ? <Badge color="green">Yes</Badge>
              : <Badge color="gray">No</Badge>}
            description="Whether a Lab editor has reviewed and validated the specialty decision for this article. See Log tab for details."
          />
        </CardBody>
      </Card>

      {/* Subspecialty */}
      <Card>
        <CardHeader label="Subspecialty" />
        <CardBody>
          {(() => {
            const subAuth = parseSubArray(raw.subspecialty);
            return (
              <>
                <DescriptionRow label="Subspecialty"    value={subAuth.length > 0 ? subAuth.join(", ") : null}                                      description="The authoritative subspecialty classification used in feeds and newsletters." />
                <DescriptionRow label="Decision date"   value={raw.subspecialty_scored_at ? fmt(raw.subspecialty_scored_at as string) : null}        description="The date the subspecialty classification was last made for this article." />
                <DescriptionRow label="Scored by model" value={a.subspecialty_model_version ?? null}                                                 description="The AI model version used to classify the subspecialty." />
              </>
            );
          })()}
          <DescriptionRow
            label="Validated by Lab"
            value={subspecialtyLabEvent
              ? <Badge color="green">Yes</Badge>
              : <Badge color="gray">No</Badge>}
            description="Whether a Lab editor has reviewed and validated the subspecialty classification. See Log tab for details."
          />
        </CardBody>
      </Card>

      {/* Article Type */}
      <Card>
        <CardHeader label="Article Type" />
        <CardBody>
          <DescriptionRow label="Article type"     value={raw.article_type as string | null}          description="The authoritative article type for this article. Set by Lab validation or deterministic scoring. This field drives all downstream logic." />
          <DescriptionRow label="Decision date"    value={raw.article_type_scored_at ? fmt(raw.article_type_scored_at as string) : null}           description="The date the article type was last determined for this article." />
          <DescriptionRow
            label="Decision method"
            value={(() => {
              const m = raw.article_type_method as string | null;
              if (!m) return null;
              const labels: Record<string, string> = {
                ai:            "AI model",
                deterministic: "Deterministic — rule-based",
              };
              return labels[m] ?? m;
            })()}
            description="How the article type was determined — by AI model or deterministic rule-based scoring."
          />
          <DescriptionRow label="Scored by model"  value={raw.article_type_model_version as string | null}                                         description="The AI model version used to determine the article type." />
          <DescriptionRow
            label="Validated by Lab"
            value={articleTypeLabEvent
              ? <Badge color="green">Yes</Badge>
              : <Badge color="gray">No</Badge>}
            description="Whether a Lab editor has reviewed and validated the article type. See Log tab for details."
          />
        </CardBody>
      </Card>

      {/* Redigering */}
      <Card>
        <CardHeader label="Editing" />
        <CardBody>
          <ArticleEditableFields
            articleId={id}
            allSpecialties={[{ slug: ACTIVE_SPECIALTY, label: specialtyLabel(ACTIVE_SPECIALTY) }]}
            articleSpecialties={specialtyRow ? [{ specialty: specialtyRow.specialty, specialty_match: specialtyRow.specialty_match }] : []}
            allSubspecialties={subspecialtiesList.map((name) => ({ name }))}
            articleSubspecialties={parseSubArray(raw.subspecialty)}
            allArticleTypes={articleTypesList.map(({ name }) => ({ name }))}
            articleType={raw.article_type as string | null}
          />
        </CardBody>
      </Card>

      {/* Article metadata */}
      {(() => {
        const POPULATION_COLORS: Record<string, { bg: string; color: string; border: string }> = {
          adult:         { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
          pediatric:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
          neonatal:      { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
          mixed:         { bg: "#faf5ff", color: "#7c3aed", border: "#ddd6fe" },
          not_specified: { bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
        };
        const popStyle   = a.patient_population
          ? POPULATION_COLORS[a.patient_population.toLowerCase()] ?? { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" }
          : null;
        const trialUrl       = a.trial_registration ? `https://clinicaltrials.gov/study/${a.trial_registration}` : null;
        const pmcFullTextUrl = a.pmc_id ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${a.pmc_id}/` : null;
        return (
          <Card>
            <CardHeader label="Article metadata" />
            <CardBody>
              <DescriptionRow
                label="Patient population"
                value={a.patient_population && popStyle ? (
                  <span style={{ fontSize: "12px", fontWeight: 600, borderRadius: "4px", padding: "2px 8px", background: popStyle.bg, color: popStyle.color, border: `1px solid ${popStyle.border}` }}>
                    {a.patient_population}
                  </span>
                ) : null}
                description="The primary patient age group studied — Adult, Pediatric, Neonatal, Mixed, or Not specified."
              />
              <DescriptionRow
                label="Time to read"
                value={a.time_to_read != null ? `${a.time_to_read} min` : null}
                description="Estimated reading time in minutes."
              />
              <DescriptionRow
                label="Full text"
                value={a.full_text_available != null ? (
                  a.full_text_available
                    ? pmcFullTextUrl
                      ? <a href={pmcFullTextUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#15803d", fontWeight: 600, textDecoration: "none" }}>Available ↗</a>
                      : <Badge color="green">Available</Badge>
                    : <Badge color="gray">Abstract only</Badge>
                ) : null}
                description="Whether the full text is freely available via PubMed Central (PMC)."
              />
              <DescriptionRow
                label="Trial registration"
                value={a.trial_registration && trialUrl ? (
                  <a href={trialUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                    {a.trial_registration} ↗
                  </a>
                ) : null}
                description="Clinical trial registration number. Links to ClinicalTrials.gov."
              />
              <DescriptionRow
                label="Auto-tagged at"
                value={raw.auto_tagged_at ? fmt(raw.auto_tagged_at as string) : null}
                description="When this article was last automatically tagged via MeSH-based specialty matching."
              />
            </CardBody>
          </Card>
        );
      })()}
    </div>
  );

  // ── Condensation tab ─────────────────────────────────────────────────────────

  const condensationTab = (
    <div style={{ padding: "4px 0 80px" }}>

      {/* Kondensering */}
      <Card>
        <CardHeader label="Condensation" />
        <CardBody>
          <DescriptionRow label="Text condensed at"    value={raw.text_condensed_at ? fmt(raw.text_condensed_at as string) : null}  description="When the text condensation (headline, summary, bottom line) was last generated." />
          <DescriptionRow label="Text model version"   value={(raw.text_model_version as string | null) ?? null}                         description="The prompt version used to generate the text condensation." />
          <DescriptionRow label="Short headline"  value={a.short_headline ?? null}                                    description="A short, punchy headline generated by AI for use in newsletter and feed cards. Max ~10 words." />
          <DescriptionRow label="Short resume"    value={a.short_resume ?? null}                                      description="A plain-language summary of the article generated by AI. Written for a clinical audience. Used in feed cards and newsletters." />
          <DescriptionRow
            label="Bottom line"
            value={a.bottom_line ?? null}
            description="A single-sentence clinical takeaway generated by AI — the most important implication for practice."
          />
        </CardBody>
      </Card>

      {/* SARI */}
      <Card>
        <CardHeader label="SARI" />
        <CardBody>
          <DescriptionRow label="SARI condensed at"    value={raw.sari_condensed_at ? fmt(raw.sari_condensed_at as string) : null}  description="When the SARI condensation was last generated." />
          <DescriptionRow label="SARI model version"   value={(raw.sari_model_version as string | null) ?? null}                    description="The prompt version used to generate the SARI condensation." />
          <DescriptionRow label="Subject"     value={raw.sari_subject as string | null}     description="Subject: what or who the article is about." />
          <DescriptionRow label="Action"      value={raw.sari_action as string | null}      description="Action: what was done, tested, or investigated." />
          <DescriptionRow label="Result"      value={raw.sari_result as string | null}      description="Result: what was found." />
          <DescriptionRow label="Implication" value={raw.sari_implication as string | null} description="Implication: what the finding means for clinical practice or future research." />
          <DescriptionRow label="Sample size"  value={a.sample_size != null ? `N = ${a.sample_size.toLocaleString("da-DK")}` : null} description="Total number of participants or cases included in the study, as extracted by AI." />
        </CardBody>
      </Card>
    </div>
  );

  // ── Location tab ─────────────────────────────────────────────────────────────

  const _firstAuthor = (raw.authors as Array<{ affiliations?: string[]; affiliation?: string | null }>)?.[0];
  const firstAuthorRawAffiliation = _firstAuthor?.affiliations?.[0] ?? _firstAuthor?.affiliation ?? null;

  const locationTab = (
    <div style={{ padding: "4px 0 80px" }}>
      {/* Rå affiliationstekst */}
      <Card>
        <CardHeader label="Raw Affiliation Text" />
        <CardBody>
          <DescriptionRow
            label="First author affiliation"
            value={firstAuthorRawAffiliation ? (
              <span style={{ fontFamily: "monospace", fontSize: "12px", wordBreak: "break-word", lineHeight: 1.5 }}>
                {decodeHtml(firstAuthorRawAffiliation)}
              </span>
            ) : null}
            description="Raw affiliation text for the first author as received from PubMed. This is the input used by the geo parser."
          />
        </CardBody>
      </Card>

      {/* GeoCard */}
      <GeoCard
        articleId={id}
        geoClass={raw.geo_class as string | null}
        addressRows={(geoAddressRows ?? []) as import("./GeoCard").ClassBAddress[]}
        metaGeoConfidence={geoMeta?.geo_confidence as string | null ?? null}
        metaParserProcessedAt={geoMeta?.parser_processed_at as string | null ?? null}
        metaParserVersion={geoMeta?.parser_version as string | null ?? null}
        metaAiProcessedAt={geoMeta?.ai_processed_at as string | null ?? null}
        metaAiModel={geoMeta?.ai_model as string | null ?? null}
        metaAiChanges={(geoMeta?.ai_changes as string[] | null) ?? []}
        metaEnrichedAt={geoMeta?.enriched_at as string | null ?? null}
        metaEnrichedStateSource={geoMeta?.enriched_state_source as string | null ?? null}
        metaAiPromptVersion={geoMeta?.ai_prompt_version as string | null ?? null}
        metaClassBAddressCount={geoMeta?.class_b_address_count as number | null ?? null}
      />

    </div>
  );

  // ── Import tab ──────────────────────────────────────────────────────────────

  const importTab = (
    <div style={{ padding: "4px 0 80px" }}>
      {/* Import */}
      <Card>
        <CardHeader label="Import" />
        <CardBody>
          <DescriptionRow
            label="Circle"
            value={(raw.circle as number | null) != null ? <Badge color="blue">{`Circle ${raw.circle}`}</Badge> : null}
            description="Import circle determining how the article entered the system. C1 = journal whitelist, C2 = affiliation-based, C3 = Danish neurosurgical departments, C4 = MeSH-based."
          />
          <DescriptionRow
            label="Imported at"
            value={importedDisplay}
            description="Timestamp of when the article was first imported into PulseFeeds."
          />
          <DescriptionRow
            label="Approval method"
            value={(() => {
              const m = raw.approval_method as string | null;
              if (m === "human")         return <Badge color="green">Approved by Editor</Badge>;
              if (m === "mesh_auto_tag") return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}>Auto-approved by MeSH</span>;
              if (m === "journal")       return <Badge color="blue">Auto-approved by Journal</Badge>;
              return null;
            })()}
            description="What triggered the article's specialty approval — journal whitelist, MeSH auto-tag, or human editor."
          />
          <DescriptionRow
            label="Source ID"
            value={raw.source_id as string | null}
            description="Reference to the source record that triggered this article's import, e.g. the journal whitelist entry or affiliation rule."
          />
          <DescriptionRow
            label="Status"
            value={raw.status ? <Badge color={(raw.status as string) === "approved" ? "green" : (raw.status as string) === "rejected" ? "red" : "orange"}>{String(raw.status)}</Badge> : null}
            description="Legacy status field from before the article_specialties table. Reflects the article's approval state at time of import."
          />
          <DescriptionRow
            label="Verified"
            value={<Badge color={raw.verified ? "green" : "red"}>{raw.verified ? "Yes" : "No"}</Badge>}
            description="Legacy boolean indicating whether the article was manually verified by an editor."
          />
          <DescriptionRow
            label="Authors unresolvable"
            value={raw.authors_unresolvable != null ? <Badge color={raw.authors_unresolvable ? "orange" : "gray"}>{raw.authors_unresolvable ? "Yes" : "No"}</Badge> : null}
            description="Set to true if the author import pipeline was unable to resolve any authors to existing or new author records."
          />
        </CardBody>
      </Card>

      {/* IDs */}
      <Card>
        <CardHeader label="IDs" />
        <CardBody>
          <DescriptionRow
            label="Article UUID"
            value={<span style={{ fontFamily: "monospace", fontSize: "12px" }}>{a.id}</span>}
            description="PulseFeeds' internal UUID for this article. Used as the primary key in all internal references."
          />
          <DescriptionRow
            label="PubMed ID"
            value={<a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>PMID {a.pubmed_id} ↗</a>}
            description="PubMed's unique identifier. Also used as the primary lookup key when syncing with PubMed."
          />
          <DescriptionRow
            label="PMC ID"
            value={pmcId ? <a href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>{pmcId} ↗</a> : null}
            description="PubMed Central ID. Present only if the article has open-access full text in PMC."
          />
        </CardBody>
      </Card>

      {/* Indeksering */}
      <Card>
        <CardHeader label="Indexing (computed at import)" />
        <CardBody>
          <DescriptionRow label="Indexed date" value={fmtDate(raw.indexed_date as string | null)}                              description="The full indexing date, derived from pubmed_indexed_at. Used as the canonical date for all filtering and feed logic in PulseFeeds." />
          <DescriptionRow label="Year"         value={raw.indexed_year  != null ? String(raw.indexed_year)  : null}            description="Year component of the indexing date. Pre-computed for efficient filtering." />
          <DescriptionRow label="Month"        value={raw.indexed_month != null ? String(raw.indexed_month) : null}            description="Month component of the indexing date. Pre-computed for efficient filtering." />
          <DescriptionRow label="Week"         value={raw.indexed_week  != null ? String(raw.indexed_week)  : null}            description="ISO week number of the indexing date. Used for weekly newsletter logic." />
        </CardBody>
      </Card>

      {/* PubMed Sync */}
      <Card>
        <CardHeader label="PubMed Sync" />
        <CardBody>
          <DescriptionRow
            label="Last synced"
            value={(raw.pubmed_synced_at as string | null) ? fmt(raw.pubmed_synced_at as string) : null}
            description="Timestamp of the most recent PubMed sync check for this article. The sync process checks for retractions and author changes."
          />
          <DescriptionRow
            label="Retracted"
            value={raw.retracted === true ? <Badge color="red">Yes</Badge> : <Badge color="gray">No</Badge>}
            description="Whether PubMed has flagged this article as retracted. Retracted articles are marked prominently in the UI and excluded from feeds."
          />
          <DescriptionRow
            label="Authors changed"
            value={raw.authors_changed === true ? <Badge color="orange">Yes</Badge> : <Badge color="gray">No</Badge>}
            description="Set to true if the PubMed sync detected a change in the author list since initial import. Triggers the author update pipeline."
          />
          <DescriptionRow
            label="New authors data"
            value={raw.authors_changed === true && Array.isArray(raw.authors_raw_new)
              ? <span style={{ color: "#9ca3af", fontSize: "13px" }}>{(raw.authors_raw_new as unknown[]).length} authors pending review</span>
              : null}
            description="The new raw author data from PubMed, stored pending processing by the author update pipeline."
          />
          <DescriptionRow
            label="Previous authors"
            value={raw.authors_raw_previous != null && Array.isArray(raw.authors_raw_previous)
              ? <span style={{ color: "#9ca3af", fontSize: "13px" }}>{(raw.authors_raw_previous as unknown[]).length} authors (previous)</span>
              : null}
            description="The previous raw author data, stored for comparison and audit purposes when an author change is detected."
          />
        </CardBody>
      </Card>
    </div>
  );

  // ── Historik tab ────────────────────────────────────────────────────────────

  const SECTIONS: { title: string; types: string[]; alwaysShow?: boolean; filter?: (ev: typeof events[0]) => boolean }[] = [
    { title: "Article import",     types: ["imported"],                                                      alwaysShow: true },
    { title: "Author import",      types: ["author_linked"],                                                 alwaysShow: true },
    { title: "Geo Updates",        types: ["geo_updated"] },
    { title: "AI Scoring",         types: ["enriched"] },
    { title: "Auto-Tagging",       types: ["auto_tagged"] },
    { title: "Lab validation",     types: ["lab_decision"] },
    { title: "Bibliometrics",      types: ["citation_count_updated"] },
    { title: "Text Condensation",  types: ["condensation_text_scored", "condensation_validated"], filter: (ev) => ev.event_type === "condensation_text_scored" || (ev.event_type === "condensation_validated" && (ev.payload as P).module === "condensation_text") },
    { title: "SARI Condensation",  types: ["condensation_sari_scored", "condensation_validated"], filter: (ev) => ev.event_type === "condensation_sari_scored" || (ev.event_type === "condensation_validated" && (ev.payload as P).module === "condensation_sari") },
  ];

  const grouped = SECTIONS.map((s) => ({
    ...s,
    events: s.filter ? events.filter(s.filter) : events.filter((ev) => s.types.includes(ev.event_type)),
  })).filter((s) => s.alwaysShow || s.events.length > 0);

  const statusChangedEvents = events.filter((ev) => ev.event_type === "status_changed");
  const verifiedEvents      = events.filter((ev) => ev.event_type === "verified");

  function findClosest(source: typeof events[0], candidates: typeof events) {
    const t = new Date(source.created_at).getTime();
    return candidates.reduce<typeof events[0] | null>((best, c) => {
      const diff     = Math.abs(new Date(c.created_at).getTime() - t);
      const bestDiff = best ? Math.abs(new Date(best.created_at).getTime() - t) : Infinity;
      return diff < bestDiff && diff < 60_000 ? c : best;
    }, null);
  }

  const logTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {grouped.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "16px", paddingBottom: "8px", borderBottom: "1px solid #e5e7eb" }}>
              {section.title}
            </div>
            {section.events.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#9ca3af" }}>Not completed yet</div>
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
                            ? <LabDecisionCard p={ev.payload} statusChange={findClosest(ev, statusChangedEvents)?.payload} verifiedChange={findClosest(ev, verifiedEvents)?.payload} />
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

  // ── Scoring tab ──────────────────────────────────────────────────────────────

  const scoringTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <Card>
        <CardHeader label="Scoring" />
        <CardBody>
          <DescriptionRow
            label="Citation count"
            value={
              <a href={citationsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                {a.citation_count ?? "—"}{a.citation_count != null ? " ↗" : ""}
              </a>
            }
            description="Number of times this article has been cited, according to Europe PMC."
          />
          <DescriptionRow
            label="Impact factor"
            value={a.impact_factor != null ? ifBadge(a.impact_factor) : null}
            description="Journal Impact Factor. Source: OpenAlex."
          />
          <DescriptionRow
            label="Journal H-index"
            value={a.journal_h_index != null ? String(a.journal_h_index) : null}
            description="The journal's h-index. Source: OpenAlex."
          />
          <DescriptionRow
            label="FWCI"
            value={raw.fwci != null ? (raw.fwci as number).toFixed(3) : null}
            description="Field-Weighted Citation Impact — compares citations to world average for same type, age, and field. Score >1 means above average. Source: OpenAlex."
          />
        </CardBody>
      </Card>
    </div>
  );

  // ── Bibliometri tab ─────────────────────────────────────────────────────────

  const bibliometricsTab = (
    <div style={{ padding: "4px 0 80px" }}>
      <Card>
        <CardHeader label="Bibliometrics" />
        <CardBody>
          <SectionLabel>Timestamps</SectionLabel>
          <DescriptionRow label="IF fetched at"    value={raw.impact_factor_fetched_at ? fmt(raw.impact_factor_fetched_at as string) : null} description="Timestamp of when the impact factor was last fetched from the data source." />
          <DescriptionRow label="Citations fetched" value={raw.citations_fetched_at ? fmt(raw.citations_fetched_at as string) : null} description="Timestamp of when the citation count was last fetched from Europe PMC." />

          <SectionLabel>OpenAlex</SectionLabel>
          <DescriptionRow
            label="OpenAlex Work"
            value={raw.openalex_work_id ? (
              <a href={`https://openalex.org/works/${raw.openalex_work_id as string}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                {String(raw.openalex_work_id)} ↗
              </a>
            ) : null}
            description="OpenAlex's unique identifier for this article. Used to fetch bibliometric data including FWCI, impact factor, and citation counts."
          />
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 48px 0" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/articles" style={{ color: "#5a6a85", textDecoration: "none" }}>← Articles</Link>
        </div>

        {/* Article header */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "24px", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
            {a.title}
          </h1>
          {raw.retracted === true && (
            <div style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "6px 12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#b91c1c" }}>⚠ RETRACTED</span>
              <span style={{ fontSize: "12px", color: "#ef4444" }}>This article has been retracted from PubMed</span>
            </div>
          )}
        </div>

      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 48px" }}>
        <AdminArticleTabs
          pubmed={pubmedTab}
          classification={classificationTab}
          condensation={condensationTab}
          scoring={scoringTab}
          location={locationTab}
          import_={importTab}
          log={logTab}
          bibliometrics={bibliometricsTab}
          note={<ArticleNoteTab articleId={id} initialNote={(raw.admin_note as string | null) ?? ""} />}
        />
      </div>
    </div>
  );
}
