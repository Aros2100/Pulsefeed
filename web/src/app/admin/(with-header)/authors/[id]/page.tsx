"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parseAffiliation } from "@/lib/affiliations";

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
  country: string | null;
  affiliations: string[] | null;
  author_score: number | null;
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profil");

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    async function load() {
      const { data: authorData } = await supabase
        .from("authors")
        .select(`id, display_name, article_count, orcid, openalex_id, ror_id,
                 openalex_enriched_at, orcid_enriched_at, ror_enriched_at,
                 created_at, updated_at,
                 department, hospital, city, country, affiliations, author_score`)
        .eq("id", id)
        .single();

      if (authorData) setAuthor(authorData as unknown as AuthorRow);

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
  const parsed      = parseAffiliation(author.affiliations ?? null);

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
              {parsed.department && <FactRow label="Afdeling"  value={parsed.department} />}
              {parsed.hospital   && <FactRow label="Hospital"  value={parsed.hospital} />}
              {parsed.city       && <FactRow label="By"        value={parsed.city} />}
              {parsed.country    && <FactRow label="Land"      value={parsed.country} />}
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
              <FactRow label="Oprettet"          value={formatDanishDate(author.created_at)} />
              <FactRow label="Sidst opdateret"   value={formatDanishDate(author.updated_at)} />
              <FactRow label="OpenAlex beriget"  value={formatDanishDate(author.openalex_enriched_at)} />
              <FactRow label="ORCID beriget"     value={formatDanishDate(author.orcid_enriched_at)} />
              <FactRow label="ROR beriget"       value={formatDanishDate(author.ror_enriched_at)} />
            </CardBody>
          )}
        </Card>

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
