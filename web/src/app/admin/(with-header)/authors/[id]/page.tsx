import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
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
      display: "grid", gridTemplateColumns: "140px 1fr",
      padding: "8px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px",
    }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

interface AuthorRow {
  id: string;
  display_name: string | null;
  article_count: number | null;
  orcid: string | null;
  match_confidence: number | null;
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
  affiliations: string[] | null;
  author_score: number | null;
}

interface ArticleRow {
  position: number | null;
  articles: {
    id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    news_value: number | null;
    evidence_score: number | null;
  };
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

export default async function AdminAuthorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: author } = await admin
    .from("authors")
    .select("id, display_name, article_count, orcid, match_confidence, department, hospital, city, country, affiliations, author_score")
    .eq("id", id)
    .single();

  if (!author) notFound();
  const typedAuthor = author as unknown as AuthorRow;

  const { data: articleRows } = await admin
    .from("article_authors")
    .select("position, articles(id, title, journal_abbr, published_date, news_value, evidence_score)")
    .eq("author_id", id)
    .order("position", { ascending: true })
    .limit(100);

  const articles = ((articleRows ?? []) as unknown as ArticleRow[])
    .map((r) => r.articles)
    .sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? ""));

  const count       = typedAuthor.article_count ?? articles.length;
  const authorScore = (count >= 3 && typedAuthor.author_score != null)
    ? Number(typedAuthor.author_score)
    : null;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "20px" }}>
          <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Forfattere
          </Link>
        </div>

        {/* Name / header card */}
        <Card>
          <CardHeader label="Author" />
          <CardBody>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>
              {typedAuthor.display_name}
            </h1>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: authorScore != null ? "10px" : 0 }}>
              {count} article{count !== 1 ? "s" : ""} indexed
            </div>
            {authorScore != null && (
              <AuthorScoreBadge score={authorScore} />
            )}
          </CardBody>
        </Card>

        {/* Facts card */}
        <Card>
          <CardHeader label="Profile" />
          <CardBody>
            <FactRow label="Name" value={typedAuthor.display_name} />
            {(() => {
              const rawAffiliations = typedAuthor.affiliations;
              const rawText = rawAffiliations?.[0] ?? null;
              const parsed = parseAffiliation(rawAffiliations ?? null);
              return (
                <>
                  {rawText      && <FactRow label="Rå affiliation" value={rawText} />}
                  {parsed.department && <FactRow label="Afdeling"  value={parsed.department} />}
                  {parsed.hospital   && <FactRow label="Hospital"  value={parsed.hospital} />}
                  {parsed.city       && <FactRow label="By"        value={parsed.city} />}
                  {parsed.country    && <FactRow label="Land"      value={parsed.country} />}
                </>
              );
            })()}
            {typedAuthor.orcid && (
              <FactRow
                label="ORCID"
                value={
                  <a
                    href={`https://orcid.org/${typedAuthor.orcid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1a6eb5", textDecoration: "none" }}
                  >
                    {typedAuthor.orcid} ↗
                  </a>
                }
              />
            )}
            {typedAuthor.match_confidence !== null && typedAuthor.match_confidence !== undefined && (
              <FactRow
                label="Match"
                value={
                  typedAuthor.match_confidence >= 1.0
                    ? <span style={{ color: "#2d7a2d", fontWeight: 600 }}>Verified</span>
                    : <span style={{ color: "#888" }}>Auto-matched</span>
                }
              />
            )}
          </CardBody>
        </Card>

        {/* Articles */}
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
