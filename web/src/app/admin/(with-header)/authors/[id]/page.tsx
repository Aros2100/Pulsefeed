"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthorGeoFields from "@/components/authors/AuthorGeoFields";

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

function CardHeader({ label }: { label: string }) {
  return (
    <div style={{
      background: "#EEF2F7",
      borderBottom: "1px solid #dde3ed",
      padding: "10px 24px",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em",
        color: "#5a6a85", textTransform: "uppercase", fontWeight: 700,
      }}>
        {label}
      </div>
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 24px" }}>{children}</div>;
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr",
      padding: "8px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px",
    }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

function AuthorScoreBadge({ score }: { score: number }) {
  const bg    = score >= 35 ? "#f0fdf4" : score >= 15 ? "#fffbeb" : "#fef2f2";
  const color = score >= 35 ? "#15803d" : score >= 15 ? "#d97706" : "#b91c1c";
  return (
    <span style={{ fontSize: "12px", fontWeight: 700, borderRadius: "6px", padding: "2px 8px", background: bg, color }}>
      {score}
    </span>
  );
}

function EvidenceScoreBadge({ score }: { score: number }) {
  const bg    = score >= 35 ? "#f0fdf4" : score >= 15 ? "#fffbeb" : "#fef2f2";
  const color = score >= 35 ? "#15803d" : score >= 15 ? "#d97706" : "#b91c1c";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, borderRadius: "5px", padding: "1px 7px", background: bg, color, flexShrink: 0 }}>
      {score}
    </span>
  );
}

interface AuthorRow {
  id: string;
  display_name: string | null;
  article_count: number | null;
  orcid: string | null;
  openalex_id: string | null;
  ror_id: string | null;
  openalex_enriched_at: string | null;
  orcid_enriched_at: string | null;
  ror_enriched_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  department: string | null;
  hospital: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  affiliations: string[] | null;
  author_score: number | null;
}

interface AuthorEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  sequence: number;
}

interface ArticleItem {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  news_value: number | null;
  evidence_score: number | null;
}

type Tab = "profil" | "openalex" | "log";

function formatDanishDate(ts: string | null): string {
  if (!ts) return "–";
  return new Date(ts).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EVENT_COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  created:           { dot: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff", label: "Oprettet" },
  openalex_enriched: { dot: "#8b5cf6", border: "#ddd6fe", bg: "#f5f3ff", label: "Institutional and location data enriched from OpenAlex" },
  geo_updated:       { dot: "#f97316", border: "#fed7aa", bg: "#fff7ed", label: "Geo opdateret" },
  merged:            { dot: "#ef4444", border: "#fecaca", bg: "#fef2f2", label: "Flettet" },
  article_linked:    { dot: "#10b981", border: "#a7f3d0", bg: "#f0fdf4", label: "New article linked to author" },
  openalex_fetched:  { dot: "#7c3aed", border: "#ddd6fe", bg: "#f5f3ff", label: "Author matched in OpenAlex" },
  geo_parsed:        { dot: "#ea580c", border: "#fed7aa", bg: "#fff7ed", label: "Author location parsed" },
};
const FALLBACK_EVENT_COLOR = { dot: "#6b7280", border: "#d1d5db", bg: "#f9fafb", label: "Hændelse" };

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px" }}>
      <span style={{ color: "#888", minWidth: "140px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

function PayloadRows({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", fontSize: "13px", padding: "4px 0", borderBottom: "1px solid #f5f5f5" }}>
          <span style={{ color: "#888" }}>{k}</span>
          <span style={{ color: "#1a1a1a", wordBreak: "break-all" }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

type EP = Record<string, unknown>;

function translateSource(v: unknown): string | null {
  if (v === "parser")   return "PubMed affiliation text";
  if (v === "openalex") return "OpenAlex";
  return v != null ? String(v) : null;
}

function translateVerifiedBy(v: unknown): string | null {
  if (v === "uverificeret") return "Not verified";
  return v != null ? String(v) : null;
}

function translateConfidence(conf: number): string {
  if (conf >= 1.0) return "Certain (ORCID)";
  if (conf >= 0.8) return "Probable (name + location)";
  return `${(conf * 100).toFixed(0)}%`;
}

function CreatedEventCard({ p }: { p: EP }) {
  const conf = p.match_confidence as number | null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <KV label="Source"      value={translateSource(p.source)} />
      <KV label="Verified by" value={translateVerifiedBy(p.verified_by)} />
      {conf != null && <KV label="Match confidence" value={translateConfidence(conf)} />}
      {typeof p.article_id === "string" && p.article_id && (
        <KV label="Article" value={
          <a href={`/admin/articles/${p.article_id}`} style={{ color: "#1a6eb5", textDecoration: "none", fontSize: "12px", fontFamily: "monospace" }}>
            {p.article_id.slice(0, 8)}… ↗
          </a>
        } />
      )}
    </div>
  );
}

function OpenAlexEnrichedEventCard({ p }: { p: EP }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.openalex_id != null && (
        <KV label="OpenAlex ID" value={
          <a href={`https://openalex.org/authors/${p.openalex_id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
            {String(p.openalex_id)} ↗
          </a>
        } />
      )}
      {p.ror_id          != null && <KV label="ROR ID"           value={String(p.ror_id)} />}
      {p.institution_type != null && <KV label="Institution type" value={String(p.institution_type)} />}
      <KV label="Geo source" value={p.geo_source as string | null} />
    </div>
  );
}

function OpenAlexFetchedEventCard({ p }: { p: EP }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.openalex_id       != null && <KV label="OpenAlex ID"      value={String(p.openalex_id)} />}
      {p.ror_id            != null && <KV label="ROR ID"           value={String(p.ror_id)} />}
      {p.institution_type  != null && <KV label="Institution type" value={String(p.institution_type)} />}
      {p.fwci              != null && <KV label="FWCI"             value={(p.fwci as number).toFixed(2)} />}
    </div>
  );
}

function GeoEventCard({ p }: { p: EP }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {p.country     != null && <KV label="Land"        value={String(p.country)} />}
      {p.city        != null && <KV label="By"          value={String(p.city)} />}
      {p.state       != null && <KV label="Stat"        value={String(p.state)} />}
      {p.institution != null && <KV label="Institution" value={String(p.institution)} />}
      {p.source      != null && <KV label="Source"      value={translateSource(p.source)} />}
    </div>
  );
}

function ArticleLinkedEventCard({ p }: { p: EP }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {typeof p.article_id === "string" && p.article_id && (
        <KV label="Article" value={
          <a href={`/admin/articles/${p.article_id}`} style={{ color: "#1a6eb5", textDecoration: "none", fontSize: "12px", fontFamily: "monospace" }}>
            {p.article_id.slice(0, 8)}… ↗
          </a>
        } />
      )}
    </div>
  );
}

function AuthorEventBody({ eventType, payload }: { eventType: string; payload: EP }) {
  switch (eventType) {
    case "created":           return <CreatedEventCard          p={payload} />;
    case "openalex_enriched": return <OpenAlexEnrichedEventCard p={payload} />;
    case "openalex_fetched":  return <OpenAlexFetchedEventCard  p={payload} />;
    case "geo_updated":       return <GeoEventCard              p={payload} />;
    case "geo_parsed":        return <GeoEventCard              p={payload} />;
    case "article_linked":    return <ArticleLinkedEventCard    p={payload} />;
    default:                  return <PayloadRows               payload={payload} />;
  }
}

const TABS: { key: Tab; label: string }[] = [
  { key: "profil",   label: "Profil"   },
  { key: "openalex", label: "OpenAlex" },
  { key: "log",      label: "Log"      },
];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", padding: "0 24px" }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: active === t.key ? 600 : 400,
            color: active === t.key ? "#1a6eb5" : "#888",
            borderBottom: active === t.key ? "2px solid #1a6eb5" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminAuthorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [author, setAuthor] = useState<AuthorRow | null>(null);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profil");

  // Geo edit state
  const [editingGeo, setEditingGeo] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);
  const [geoValues, setGeoValues] = useState({ country: "", city: "", state: "", hospital: "", department: "" });

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    async function load() {
      const { data: authorData } = await supabase
        .from("authors")
        .select(`id, display_name, article_count, orcid, openalex_id, ror_id,
                 openalex_enriched_at, orcid_enriched_at, ror_enriched_at,
                 created_at, updated_at,
                 department, hospital, city, state, country, affiliations, author_score`)
        .eq("id", id)
        .single();

      if (authorData) {
        const a = authorData as unknown as AuthorRow;
        setAuthor(a);
        setGeoValues({
          country:    a.country    ?? "",
          city:       a.city       ?? "",
          state:      a.state      ?? "",
          hospital:   a.hospital   ?? "",
          department: a.department ?? "",
        });
      }

      const { data: articleRows } = await supabase
        .from("article_authors")
        .select("position, articles(id, title, journal_abbr, published_date, news_value, evidence_score)")
        .eq("author_id", id)
        .order("position", { ascending: true })
        .limit(100);

      const sorted = ((articleRows ?? []) as unknown as Array<{ articles: ArticleItem }>)
        .map(r => r.articles)
        .sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? ""));

      setArticles(sorted);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: eventRows } = await (supabase as any)
        .from("author_events")
        .select("id, event_type, payload, created_at")
        .eq("author_id", id)
        .order("sequence", { ascending: true });
      const EVENT_ORDER = [
        "created",
        "geo_parsed",
        "openalex_fetched",
        "openalex_enriched",
        "article_linked",
        "merged",
      ];
      const rows = (eventRows as AuthorEvent[] | null) ?? [];
      rows.sort((a, b) => {
        const aTime = Math.floor(new Date(a.created_at).getTime() / 1000);
        const bTime = Math.floor(new Date(b.created_at).getTime() / 1000);
        if (aTime !== bTime) return aTime - bTime;
        const ai = EVENT_ORDER.indexOf(a.event_type);
        const bi = EVENT_ORDER.indexOf(b.event_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setEvents(rows);

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#888", fontSize: "14px" }}>Indlæser...</span>
      </div>
    );
  }

  if (!author) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh", padding: "32px 24px" }}>
        <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>← Forfattere</Link>
        <p style={{ color: "#888", marginTop: "24px", fontSize: "14px" }}>Forfatter ikke fundet.</p>
      </div>
    );
  }

  const count       = author.article_count ?? articles.length;
  const authorScore = (count >= 3 && author.author_score != null) ? Number(author.author_score) : null;

  async function saveGeo() {
    setSavingGeo(true);
    try {
      const res = await fetch(`/api/admin/authors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country:    geoValues.country    || null,
          city:       geoValues.city       || null,
          state:      geoValues.state      || null,
          hospital:   geoValues.hospital   || null,
          department: geoValues.department || null,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setAuthor((prev) => prev ? {
          ...prev,
          country:    geoValues.country    || null,
          city:       geoValues.city       || null,
          state:      geoValues.state      || null,
          hospital:   geoValues.hospital   || null,
          department: geoValues.department || null,
        } : prev);
        setEditingGeo(false);
      }
    } catch { /* ignore */ }
    setSavingGeo(false);
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "20px" }}>
          <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Forfattere
          </Link>
        </div>

        {/* Header card */}
        <Card>
          <CardHeader label="Author" />
          <CardBody>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>
              {author.display_name}
            </h1>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: authorScore != null ? "10px" : 0 }}>
              {count} article{count !== 1 ? "s" : ""} indexed
            </div>
            {authorScore != null && <AuthorScoreBadge score={authorScore} />}
          </CardBody>
        </Card>

        {/* Tabbed profile card */}
        <Card>
          <CardHeader label="Profile" />
          <TabBar active={activeTab} onChange={setActiveTab} />

          {activeTab === "profil" && (
            <CardBody>
              <FactRow label="Name" value={author.display_name} />
              {author.orcid && (
                <FactRow
                  label="ORCID"
                  value={
                    <a href={`https://orcid.org/${author.orcid}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                      {author.orcid} ↗
                    </a>
                  }
                />
              )}

              {/* Geo section */}
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85" }}>
                    Lokation
                  </span>
                  {!editingGeo && (
                    <button
                      onClick={() => setEditingGeo(true)}
                      style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", padding: "4px 10px", borderRadius: "6px", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Rediger
                    </button>
                  )}
                </div>

                {editingGeo ? (
                  <div>
                    <AuthorGeoFields
                      values={geoValues}
                      onChange={(field, value) => setGeoValues((g) => ({ ...g, [field]: value }))}
                      disabled={savingGeo}
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                      <button
                        onClick={() => void saveGeo()}
                        disabled={savingGeo}
                        style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {savingGeo ? "Gemmer…" : "Gem"}
                      </button>
                      <button
                        onClick={() => {
                          setGeoValues({
                            country:    author.country    ?? "",
                            city:       author.city       ?? "",
                            state:      author.state      ?? "",
                            hospital:   author.hospital   ?? "",
                            department: author.department ?? "",
                          });
                          setEditingGeo(false);
                        }}
                        disabled={savingGeo}
                        style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Annuller
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {!author.country && !author.city && !author.hospital ? (
                      <span style={{ fontSize: "13px", color: "#aaa" }}>Ingen lokationsdata</span>
                    ) : (
                      <>
                        {author.department && <FactRow label="Afdeling"    value={author.department} />}
                        {author.hospital   && <FactRow label="Hospital"    value={author.hospital} />}
                        {author.city       && <FactRow label="By"          value={author.city} />}
                        {author.state      && <FactRow label="Stat/Region" value={author.state} />}
                        {author.country    && <FactRow label="Land"        value={author.country} />}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          )}

          {activeTab === "openalex" && (
            <CardBody>
              {author.openalex_id ? (
                <FactRow
                  label="OpenAlex ID"
                  value={
                    <a href={`https://openalex.org/authors/${author.openalex_id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                      {author.openalex_id} ↗
                    </a>
                  }
                />
              ) : (
                <FactRow label="OpenAlex ID" value={<span style={{ color: "#bbb" }}>–</span>} />
              )}
              {author.ror_id ? (
                <FactRow
                  label="ROR ID"
                  value={
                    <a href={`https://ror.org/${author.ror_id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                      {author.ror_id} ↗
                    </a>
                  }
                />
              ) : (
                <FactRow label="ROR ID" value={<span style={{ color: "#bbb" }}>–</span>} />
              )}
              <FactRow
                label="Author score"
                value={authorScore != null ? <AuthorScoreBadge score={authorScore} /> : <span style={{ color: "#bbb" }}>–</span>}
              />
              <FactRow label="Articles" value={String(count)} />
            </CardBody>
          )}

          {activeTab === "log" && (
            <CardBody>
              {events.length === 0 ? (
                <div style={{ fontSize: "14px", color: "#888", textAlign: "center", padding: "16px 0" }}>
                  Ingen hændelser registreret
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: "15px", top: "8px", bottom: "8px", width: "2px", background: "#e5e7eb" }} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {events.map((ev) => {
                      const c = EVENT_COLORS[ev.event_type] ?? FALLBACK_EVENT_COLOR;
                      return (
                        <div key={ev.id} style={{ display: "flex", gap: "20px", alignItems: "flex-start", paddingBottom: "20px" }}>
                          <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", background: c.bg, border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, position: "relative" }}>
                            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.dot }} />
                          </div>
                          <div style={{ flex: 1, background: "#fff", borderRadius: "8px", border: `1px solid ${c.border}`, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: c.dot, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</span>
                              <span style={{ fontSize: "11px", color: "#9ca3af" }}>{formatDanishDate(ev.created_at)}</span>
                            </div>
                            <AuthorEventBody eventType={ev.event_type} payload={ev.payload} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardBody>
          )}
        </Card>

        {author.affiliations && author.affiliations.length > 0 && (
          <Card>
            <CardHeader label="Affiliations" />
            <CardBody>
              {author.affiliations.map((aff, i) => (
                <div key={i} style={{
                  fontSize: "13px", color: "#1a1a1a", lineHeight: 1.5,
                  padding: "8px 0",
                  borderBottom: i < author.affiliations!.length - 1 ? "1px solid #f5f5f5" : undefined,
                }}>
                  {aff}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Articles card — always visible */}
        <Card>
          <CardHeader label={`Articles · ${count}`} />
          {articles.length === 0 ? (
            <CardBody>
              <div style={{ fontSize: "14px", color: "#888" }}>No articles found.</div>
            </CardBody>
          ) : (
            articles.map((article, i) => {
              const meta = [article.journal_abbr, article.published_date?.slice(0, 7)]
                .filter(Boolean).join(" · ");
              return (
                <Link
                  key={article.id}
                  href={`/admin/articles/${article.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "14px 24px",
                    borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {meta && (
                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>
                        {meta}
                      </div>
                    )}
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4 }}>
                      {article.title}
                    </div>
                  </div>
                  {article.evidence_score != null && (
                    <EvidenceScoreBadge score={article.evidence_score} />
                  )}
                </Link>
              );
            })
          )}
        </Card>

      </div>
    </div>
  );
}
