"use client";
import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TestSendButton from "./TestSendButton";
import { renderNewsletterHtml, type Article, type Section } from "@/lib/newsletter/render";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subspecialty { id: string; name: string; sort_order: number }
interface EditionArticle { id: string; article_id: string; subspecialty: string; sort_order: number; is_global: boolean }
interface ArticleDetail { id: string; title: string; article_type: string | null; journal_abbr: string | null; pubmed_id: string }
interface FirstAuthor { article_id: string; authors: { display_name: string | null; country: string | null } }

interface Props {
  edition: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null };
  subspecialties: Subspecialty[];
  editionArticles: EditionArticle[];
  articleDetails: ArticleDetail[];
  firstAuthors: FirstAuthor[];
  firstName: string;
  pubmedTotal: number;
  pubmedBySubspecialty: Record<string, number>;
}

const ARTICLES_PER_SUB: Record<number, number> = { 1: 5, 2: 4, 3: 3 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterPreviewClient({ edition, subspecialties, editionArticles, articleDetails, firstAuthors, firstName, pubmedTotal, pubmedBySubspecialty }: Props) {
  const router = useRouter();
  const [subCount, setSubCount] = useState<1 | 2 | 3>(2);
  const [approving, setApproving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const content = edition.content as Record<string, unknown> | null;
  const globalIntro = typeof content?.global_intro === "string" ? content.global_intro : "";
  const subspecialtyComments = (content?.subspecialty_comments ?? {}) as Record<string, string>;

  const detailMap = useMemo(() => new Map(articleDetails.map((a) => [a.id, a])), [articleDetails]);
  const authorMap = useMemo(() => new Map(firstAuthors.map((r) => [r.article_id, r.authors])), [firstAuthors]);

  // Saturday label for header
  const satLabel = useMemo(() => {
    const jan4 = new Date(Date.UTC(edition.year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (edition.week_number - 1) * 7);
    const sat = new Date(monday);
    sat.setUTCDate(monday.getUTCDate() + 5);
    return sat.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }, [edition.week_number, edition.year]);

  // Topbar label includes weekday
  const saturdayLabel = useMemo(() => {
    const jan4 = new Date(Date.UTC(edition.year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (edition.week_number - 1) * 7);
    const sat = new Date(monday);
    sat.setUTCDate(monday.getUTCDate() + 5);
    return sat.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }, [edition.week_number, edition.year]);

  function toArticle(ea: EditionArticle): Article | null {
    const d = detailMap.get(ea.article_id);
    if (!d) return null;
    const author = authorMap.get(ea.article_id);
    const lastName = author?.display_name ? author.display_name.split(" ").pop() ?? null : null;
    return { title: d.title, article_type: d.article_type, journal_abbr: d.journal_abbr, pubmed_id: d.pubmed_id, authorLastName: lastName, country: author?.country ?? null };
  }

  const limit = ARTICLES_PER_SUB[subCount];

  const { sections, globalArticles } = useMemo(() => {
    const withArticles = new Set(editionArticles.map((ea) => ea.subspecialty));
    const activeSubs = subspecialties
      .filter((s) => withArticles.has(s.name))
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, subCount);

    const sections: Section[] = activeSubs.map((sub) => ({
      name: sub.name,
      comment: subspecialtyComments[sub.name] ?? "",
      articles: editionArticles
        .filter((ea) => ea.subspecialty === sub.name)
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, limit)
        .map(toArticle)
        .filter((a): a is Article => a !== null),
    }));

    const globalArticles = editionArticles
      .filter((ea) => ea.is_global)
      .map(toArticle)
      .filter((a): a is Article => a !== null);

    return { sections, globalArticles };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionArticles, subspecialties, subCount, limit, detailMap, authorMap, subspecialtyComments]);

  const html = useMemo(() =>
    renderNewsletterHtml({ weekNumber: edition.week_number, year: edition.year, satLabel, firstName, pubmedTotal, pubmedBySubspecialty, globalIntro, sections, globalArticles }),
    [edition.week_number, edition.year, satLabel, firstName, pubmedTotal, pubmedBySubspecialty, globalIntro, sections, globalArticles]
  );

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentDocument?.body) {
      iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
    }
  }, []);

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
          href={`/admin/newsletter/${edition.id}/intro-texts`}
          style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← Intro texts
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Week {edition.week_number} · Neurosurgery · {saturdayLabel}
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
          <TestSendButton editionId={edition.id} />
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

      {/* ── Email preview (iframe) ─────────────────────────────────────────── */}
      <div style={{ padding: "32px 24px 80px" }}>
        <div style={{
          maxWidth: "620px", margin: "0 auto",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          overflow: "hidden",
          background: "#fff",
        }}>
          <iframe
            ref={iframeRef}
            srcDoc={html}
            style={{ width: "100%", border: "none", display: "block", minHeight: "600px" }}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
}
