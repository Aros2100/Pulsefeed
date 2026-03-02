import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

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

// ── Timeline event types ──────────────────────────────────────────────────────

type EventKind = "import" | "enrich" | "lab" | "feedback";

interface TimelineEvent {
  kind: EventKind;
  ts: string; // ISO
  data: Record<string, unknown>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const COLORS: Record<EventKind, { dot: string; border: string; bg: string; label: string }> = {
  import:   { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff",  label: "Import" },
  enrich:   { dot: "#8b5cf6", border: "#ddd6fe", bg: "#f5f3ff",  label: "AI Berigelse" },
  lab:      { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4",  label: "Lab" },
  feedback: { dot: "#f59e0b", border: "#fde68a", bg: "#fffbeb",  label: "Feedback" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: "999px",
      fontSize: "11px", fontWeight: 600, background: color === "green" ? "#f0fdf4" : color === "red" ? "#fef2f2" : color === "blue" ? "#eff6ff" : "#f5f3ff",
      color: color === "green" ? "#15803d" : color === "red" ? "#b91c1c" : color === "blue" ? "#1d4ed8" : "#6d28d9",
      border: `1px solid ${color === "green" ? "#bbf7d0" : color === "red" ? "#fecaca" : color === "blue" ? "#bfdbfe" : "#ddd6fe"}`,
    }}>
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

function ImportCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Tidspunkt" value={fmt(data.imported_at as string)} />
      <KV label="Cirkel" value={`Circle ${data.circle}`} />
      <KV label="Status ved import" value={
        <Badge color={data.status === "approved" ? "green" : "blue"}>
          {String(data.status ?? "pending")}
        </Badge>
      } />
      {Array.isArray(data.specialty_tags) && (data.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty tags" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(data.specialty_tags as string[]).map((s) => (
              <Badge key={s} color="blue">{specialtyLabel(s)}</Badge>
            ))}
          </span>
        } />
      )}
    </div>
  );
}

function EnrichCard({ data }: { data: Record<string, unknown> }) {
  const conf = data.specialty_confidence as number | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Tidspunkt" value={fmt(data.enriched_at as string)} />
      <KV label="AI beslutning" value={
        data.ai_decision
          ? <Badge color={data.ai_decision === "approved" ? "green" : "red"}>{String(data.ai_decision)}</Badge>
          : null
      } />
      <KV label="Specialty confidence" value={conf != null ? `${(conf * 100).toFixed(1)}%` : null} />
      <KV label="Model" value={data.model_version as string | null} />
      {Array.isArray(data.specialty_tags) && (data.specialty_tags as string[]).length > 0 && (
        <KV label="Specialty tags" value={
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(data.specialty_tags as string[]).map((s) => (
              <Badge key={s} color="purple">{specialtyLabel(s)}</Badge>
            ))}
          </span>
        } />
      )}
    </div>
  );
}

function LabCard({ data }: { data: Record<string, unknown> }) {
  const aiConf = data.ai_confidence as number | null;
  const decision = data.decision as string;
  const aiDecision = data.ai_decision as string | null;
  const agree = !aiDecision || decision === aiDecision;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Tidspunkt" value={fmt(data.decided_at as string)} />
      <KV label="Modul" value={data.module as string} />
      <KV label="Specialty" value={specialtyLabel(data.specialty as string)} />
      <KV label="Beslutning" value={
        <Badge color={decision === "approved" ? "green" : "red"}>{decision}</Badge>
      } />
      {aiDecision && (
        <KV label="AI beslutning" value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Badge color={aiDecision === "approved" ? "green" : "red"}>{aiDecision}</Badge>
            {agree
              ? <span style={{ fontSize: "11px", color: "#15803d" }}>✓ enig</span>
              : <span style={{ fontSize: "11px", color: "#b91c1c" }}>✗ uenig</span>
            }
          </span>
        } />
      )}
      {aiConf != null && (
        <KV label="AI confidence" value={`${(aiConf * 100).toFixed(1)}%`} />
      )}
      {Boolean(data.disagreement_reason) && (
        <KV label="Årsag til uenighed" value={
          <span style={{ color: "#b91c1c" }}>{String(data.disagreement_reason)}</span>
        } />
      )}
    </div>
  );
}

function FeedbackCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Tidspunkt" value={fmt(data.decided_at as string)} />
      <KV label="Uge / År" value={`Uge ${data.week_number}, ${data.year}`} />
      {data.decision && (
        <KV label="Beslutning" value={
          <Badge color={data.decision === "approved" ? "green" : "red"}>{String(data.decision)}</Badge>
        } />
      )}
      {data.news_value != null && (
        <KV label="Nyhedsværdi" value={`${data.news_value} / 5`} />
      )}
      {data.clinical_relevance != null && (
        <KV label="Klinisk relevans" value={`${data.clinical_relevance} / 5`} />
      )}
    </div>
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

  const [articleResult, decisionsResult, feedbackResult] = await Promise.all([
    admin.from("articles").select("*").eq("id", id).maybeSingle(),
    admin
      .from("lab_decisions")
      .select("*")
      .eq("article_id", id)
      .order("decided_at", { ascending: true }),
    admin
      .from("newsletter_feedback")
      .select("*")
      .eq("article_id", id)
      .order("decided_at", { ascending: true }),
  ]);

  const article = articleResult.data;
  if (!article) notFound();

  // ── Build timeline ──────────────────────────────────────────────────────────

  const events: TimelineEvent[] = [];

  // 1. Import
  events.push({
    kind: "import",
    ts: article.imported_at,
    data: {
      imported_at: article.imported_at,
      circle: article.circle,
      status: article.status,
      specialty_tags: article.specialty_tags,
    },
  });

  // 2. AI enrichment
  if (article.enriched_at) {
    events.push({
      kind: "enrich",
      ts: article.enriched_at,
      data: {
        enriched_at: article.enriched_at,
        ai_decision: article.ai_decision,
        specialty_confidence: article.specialty_confidence,
        model_version: article.model_version,
        specialty_tags: article.specialty_tags,
      },
    });
  }

  // 3. Lab decisions
  for (const d of decisionsResult.data ?? []) {
    events.push({
      kind: "lab",
      ts: d.decided_at ?? article.imported_at,
      data: d as unknown as Record<string, unknown>,
    });
  }

  // 4. Newsletter feedback
  for (const f of feedbackResult.data ?? []) {
    events.push({
      kind: "feedback",
      ts: f.decided_at ?? article.imported_at,
      data: f as unknown as Record<string, unknown>,
    });
  }

  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // ── Current status summary ──────────────────────────────────────────────────

  const statusColor = article.status === "approved" ? "#15803d"
    : article.status === "rejected" ? "#b91c1c"
    : "#d97706";

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <Header />

      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>← System</Link>
          <span style={{ margin: "0 6px" }}>·</span>
          <Link href="/articles" style={{ color: "#5a6a85", textDecoration: "none" }}>Artikler</Link>
        </div>

        {/* Article header */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "24px",
          marginBottom: "32px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "12px" }}>
            <h1 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
              {article.title}
            </h1>
            <span style={{
              flexShrink: 0, fontSize: "11px", fontWeight: 700, borderRadius: "999px",
              padding: "3px 10px", border: `1px solid ${statusColor}20`, background: `${statusColor}10`, color: statusColor,
            }}>
              {article.status ?? "pending"}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px", color: "#5a6a85" }}>
            <span>PMID <strong style={{ color: "#1a1a1a" }}>{article.pubmed_id}</strong></span>
            <span>Circle <strong style={{ color: "#1a1a1a" }}>{article.circle}</strong></span>
            {article.journal_abbr && <span>{article.journal_abbr}</span>}
            {article.published_date && <span>{article.published_date}</span>}
            <Link
              href={`/articles/${article.id}`}
              style={{ color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}
            >
              Se public stamkort →
            </Link>
          </div>
        </div>

        {/* Heading */}
        <div style={{
          fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#5a6a85", marginBottom: "20px",
        }}>
          Historik · {events.length} begivenheder
        </div>

        {/* Timeline */}
        <div style={{ position: "relative" }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute", left: "15px", top: "8px",
            bottom: "8px", width: "2px", background: "#e5e7eb",
          }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {events.map((ev, i) => {
              const c = COLORS[ev.kind];
              return (
                <div key={i} style={{ display: "flex", gap: "20px", alignItems: "flex-start", paddingBottom: "24px" }}>
                  {/* Dot */}
                  <div style={{
                    flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%",
                    background: c.bg, border: `2px solid ${c.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1, position: "relative",
                  }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.dot }} />
                  </div>

                  {/* Card */}
                  <div style={{
                    flex: 1, background: "#fff", borderRadius: "8px",
                    border: `1px solid ${c.border}`,
                    padding: "14px 16px",
                  }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: "10px",
                    }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: c.dot, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {c.label}
                      </span>
                      <span style={{ fontSize: "11px", color: "#9ca3af" }}>{fmt(ev.ts)}</span>
                    </div>

                    {ev.kind === "import"   && <ImportCard   data={ev.data} />}
                    {ev.kind === "enrich"   && <EnrichCard   data={ev.data} />}
                    {ev.kind === "lab"      && <LabCard      data={ev.data} />}
                    {ev.kind === "feedback" && <FeedbackCard data={ev.data} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {events.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px", fontSize: "13px", color: "#888" }}>
            Ingen historik fundet for denne artikel
          </div>
        )}

      </div>
    </div>
  );
}
