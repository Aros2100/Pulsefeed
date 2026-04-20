"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subspecialty { id: string; name: string; sort_order: number }
interface EditionArticle { id: string; article_id: string; subspecialty: string; sort_order: number; is_global: boolean }
interface ArticleDetail { id: string; title: string; article_type: string | null; journal_title: string | null; pubmed_id: string }
interface FirstAuthor { article_id: string; authors: { display_name: string | null; country: string | null } }

interface Props {
  edition: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null };
  subspecialties: Subspecialty[];
  editionArticles: EditionArticle[];
  articleDetails: ArticleDetail[];
  firstAuthors: FirstAuthor[];
}

const ARTICLES_PER_SUB: Record<number, number> = { 1: 5, 2: 4, 3: 3 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterPreviewClient({ edition, subspecialties, editionArticles, articleDetails, firstAuthors }: Props) {
  const router = useRouter();
  const [subCount, setSubCount] = useState<1 | 2 | 3>(2);
  const [approving, setApproving] = useState(false);

  const content = edition.content as Record<string, unknown> | null;
  const globalIntro = typeof content?.global_intro === "string" ? content.global_intro : "";
  const subspecialtyComments = (content?.subspecialty_comments ?? {}) as Record<string, string>;

  const detailMap = useMemo(() => new Map(articleDetails.map((a) => [a.id, a])), [articleDetails]);
  const authorMap = useMemo(() => new Map(firstAuthors.map((r) => [r.article_id, r.authors])), [firstAuthors]);

  // Active subspecialties with articles, limited by selector
  const activeSubs = useMemo(() => {
    const withArticles = new Set(editionArticles.map((ea) => ea.subspecialty));
    return subspecialties
      .filter((s) => withArticles.has(s.name))
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, subCount);
  }, [subspecialties, editionArticles, subCount]);

  const limit = ARTICLES_PER_SUB[subCount];

  function getSubArticles(subName: string): ArticleDetail[] {
    return editionArticles
      .filter((ea) => ea.subspecialty === subName)
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, limit)
      .map((ea) => detailMap.get(ea.article_id))
      .filter((a): a is ArticleDetail => a !== undefined);
  }

  const globalArticles = useMemo(() =>
    editionArticles
      .filter((ea) => ea.is_global)
      .map((ea) => detailMap.get(ea.article_id))
      .filter((a): a is ArticleDetail => a !== undefined),
    [editionArticles, detailMap]
  );

  async function approve() {
    setApproving(true);
    try {
      const res = await fetch("/api/admin/newsletter/edition", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edition.id, content: { ...content, status: "approved" } }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      router.push(`/admin/newsletter/${edition.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
      setApproving(false);
    }
  }

  const weekDate = (() => {
    // Approximate date from week_number + year (ISO week → Monday)
    const jan4 = new Date(edition.year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (edition.week_number - 1) * 7);
    return monday.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  })();

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#e8ecf0", color: "#1a1a1a", minHeight: "100vh" }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: "52px", background: "#fff", borderBottom: "1px solid #dde3ed",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "14px",
        position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <Link
          href={`/admin/newsletter/${edition.id}/ai-tekster`}
          style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← AI texts
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Week {edition.week_number} · {edition.year}
        </span>

        {/* Subscriber selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "8px" }}>
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => setSubCount(n)}
              style={{
                fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                padding: "4px 10px", borderRadius: "6px",
                border: `1px solid ${subCount === n ? "#1a1a1a" : "#dde3ed"}`,
                background: subCount === n ? "#1a1a1a" : "#fff",
                color: subCount === n ? "#fff" : "#5a6a85",
                cursor: "pointer",
              }}
            >
              {n} sub
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={approve}
            disabled={approving}
            style={{
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              background: approving ? "#94a3b8" : "#059669", color: "#fff",
              border: "none", borderRadius: "7px", padding: "7px 16px",
              cursor: approving ? "default" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {approving ? "Approving…" : "Approve →"}
          </button>
        </div>
      </div>

      {/* ── Email preview ─────────────────────────────────────────────────── */}
      <div style={{ padding: "32px 24px 80px" }}>
        <div style={{
          maxWidth: "620px", margin: "0 auto",
          background: "#fff",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}>

          {/* Email header */}
          <div style={{
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            padding: "20px 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", letterSpacing: "0.02em" }}>
              Pulse<span style={{ color: "#E83B2A" }}>Feed</span>
            </span>
            <span style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.04em" }}>
              {weekDate}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: "32px 32px 0" }}>

            {/* Global intro — top of email, no divider */}
            {globalIntro && (
              <p style={{
                fontSize: "14px", lineHeight: 1.75, color: "#374151",
                marginBottom: "28px", marginTop: 0,
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
              }}>
                {globalIntro}
              </p>
            )}

            {/* Subspecialty sections */}
            {activeSubs.map((sub) => {
              const articles = getSubArticles(sub.name);
              const comment = subspecialtyComments[sub.name] ?? "";
              return (
                <div key={sub.id}>
                  <SectionDivider label={sub.name} />
                  {comment && (
                    <p style={{ fontSize: "14px", lineHeight: 1.75, color: "#374151", marginBottom: "20px", marginTop: 0 }}>
                      {comment}
                    </p>
                  )}
                  <ArticleList articles={articles} authorMap={authorMap} />
                </div>
              );
            })}

            {/* Global highlights */}
            {globalArticles.length > 0 && (
              <div>
                <SectionDivider label="This week's highlights" highlight />
                <ArticleList articles={globalArticles} authorMap={authorMap} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: "1px solid #e5e7eb",
            padding: "24px 32px",
            marginTop: "32px",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "11px", color: "#9ca3af", margin: "0 0 6px", lineHeight: 1.6 }}>
              PulseFeed sends every Saturday
            </p>
            <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0, lineHeight: 1.6 }}>
              <span style={{ color: "#6b7280", textDecoration: "underline", cursor: "default" }}>Manage preferences</span>
              {" · "}
              <span style={{ color: "#6b7280", textDecoration: "underline", cursor: "default" }}>Unsubscribe</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionDivider({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "4px",
      }}>
        <div style={{ flex: 1, height: "1px", background: highlight ? "#d1fae5" : "#e5e7eb" }} />
        <span style={{
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: highlight ? "#059669" : "#9ca3af",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: "1px", background: highlight ? "#d1fae5" : "#e5e7eb" }} />
      </div>
    </div>
  );
}

function ArticleList({ articles, authorMap }: { articles: ArticleDetail[]; authorMap: Map<string, { display_name: string | null; country: string | null }> }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      {articles.map((a, i) => {
        const author = authorMap.get(a.id);
        const meta = [
          a.article_type,
          a.journal_title,
          author?.display_name ? author.display_name.split(" ").pop() : null,
          author?.country,
        ].filter(Boolean).join(" · ");

        return (
          <div key={a.id} style={{
            paddingBottom: i < articles.length - 1 ? "14px" : 0,
            marginBottom: i < articles.length - 1 ? "14px" : 0,
            borderBottom: i < articles.length - 1 ? "1px solid #f3f4f6" : undefined,
          }}>
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none", lineHeight: 1.45, display: "block", marginBottom: "4px" }}
            >
              {a.title}
            </a>
            {meta && (
              <span style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.4 }}>{meta}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
