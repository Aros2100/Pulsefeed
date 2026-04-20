"use client";
import { useState, useMemo } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subspecialty {
  id: string;
  name: string;
  sort_order: number;
}

interface EditionArticle {
  id: string;
  article_id: string;
  subspecialty: string;
  sort_order: number;
  is_global: boolean;
}

interface ArticleDetail {
  id: string;
  title: string;
  article_type: string | null;
}

interface Props {
  edition: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null };
  subspecialties: Subspecialty[];
  editionArticles: EditionArticle[];
  articleDetails: ArticleDetail[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterAiClient({ edition, subspecialties, editionArticles, articleDetails }: Props) {
  const content = edition.content as Record<string, unknown> | null;

  const [globalIntro, setGlobalIntro] = useState<string>(
    typeof content?.global_intro === "string" ? content.global_intro : ""
  );
  const savedComments = (content?.subspecialty_comments ?? {}) as Record<string, string>;
  const [comments, setComments] = useState<Record<string, string>>(savedComments);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const detailMap = useMemo(
    () => new Map(articleDetails.map((a) => [a.id, a])),
    [articleDetails]
  );

  // Global articles (is_global = true)
  const globalArticles = useMemo(() => {
    console.log("[intro-texts] editionArticles:", editionArticles);
    console.log("[intro-texts] is_global count:", editionArticles.filter((ea) => ea.is_global).length);
    return editionArticles
      .filter((ea) => ea.is_global)
      .map((ea) => detailMap.get(ea.article_id))
      .filter((a): a is ArticleDetail => a !== null && a !== undefined);
  }, [editionArticles, detailMap]);

  // Subspecialties that have articles, in sort_order
  const activeSubs = useMemo(() => {
    const withArticles = new Set(editionArticles.map((ea) => ea.subspecialty));
    return subspecialties
      .filter((s) => withArticles.has(s.name))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [subspecialties, editionArticles]);

  // Top-3 articles per subspecialty (by sort_order)
  function getSubArticles(subName: string): ArticleDetail[] {
    return editionArticles
      .filter((ea) => ea.subspecialty === subName)
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 3)
      .map((ea) => detailMap.get(ea.article_id))
      .filter((a): a is ArticleDetail => a !== null && a !== undefined);
  }

  async function generate(key: string, type: "global" | "subspecialty", articles: ArticleDetail[], subspecialty?: string) {
    setGenerating((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/admin/newsletter/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          ...(subspecialty ? { subspecialty } : {}),
          articles: articles.map((a) => ({ title: a.title, article_type: a.article_type })),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (type === "global") {
        setGlobalIntro(json.text);
      } else {
        setComments((prev) => ({ ...prev, [key]: json.text }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const patchBody = {
        id: edition.id,
        content: {
          global_intro: globalIntro,
          subspecialty_comments: Object.fromEntries(
            Object.entries(comments).map(([k, v]) => [k, v ?? ""])
          ),
        },
      };
      console.log("[intro-texts] save body:", JSON.stringify(patchBody));
      const res = await fetch("/api/admin/newsletter/edition", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh",
    }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: "52px", background: "#fff", borderBottom: "1px solid #dde3ed",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "14px",
        position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <Link
          href={`/admin/newsletter/${edition.id}/review`}
          style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← Review
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Week {edition.week_number} · {edition.year}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          {saving && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Saving…</span>}
          <button
            onClick={save}
            style={{
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              background: "#1a1a1a", color: "#fff",
              border: "none", borderRadius: "7px", padding: "7px 16px",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Save →
          </button>
          <Link
            href={`/admin/newsletter/${edition.id}/preview`}
            style={{
              fontSize: "13px", fontWeight: 600,
              background: "#059669", color: "#fff",
              borderRadius: "7px", padding: "7px 16px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Preview →
          </Link>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {saveError && (
        <div style={{
          background: "#fff5f5", borderBottom: "1px solid #fecaca",
          padding: "8px 20px", fontSize: "13px", color: "#b91c1c",
        }}>
          {saveError}
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Global intro */}
        <Section
          label="Global intro"
          articles={globalArticles}
          generating={!!generating["global"]}
          onGenerate={() => generate("global", "global", globalArticles)}
        >
          <textarea
            value={globalIntro}
            onChange={(e) => setGlobalIntro(e.target.value)}
            placeholder="Global intro for this week's newsletter…"
            rows={4}
            style={textareaStyle}
          />
        </Section>

        {/* Per-subspecialty */}
        {activeSubs.map((sub) => {
          const articles = getSubArticles(sub.name);
          return (
            <Section
              key={sub.id}
              label={sub.name}
              articles={articles}
              generating={!!generating[sub.name]}
              onGenerate={() => generate(sub.name, "subspecialty", articles, sub.name)}
            >
              <textarea
                value={comments[sub.name] ?? ""}
                onChange={(e) => setComments((prev) => ({ ...prev, [sub.name]: e.target.value }))}
                placeholder={`Comment for ${sub.name}…`}
                rows={4}
                style={textareaStyle}
              />
            </Section>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: "100%", fontSize: "14px", lineHeight: 1.7,
  border: "1px solid #dde3ed", borderRadius: "8px",
  padding: "12px 14px", resize: "vertical",
  fontFamily: "inherit", color: "#1a1a1a",
  background: "#fff", outline: "none",
  boxSizing: "border-box",
};

function Section({
  label,
  articles,
  generating,
  onGenerate,
  children,
}: {
  label: string;
  articles: { title: string; article_type: string | null }[];
  generating: boolean;
  onGenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #dde3ed",
      borderRadius: "10px",
      marginBottom: "20px",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#f8f9fb",
        borderBottom: "1px solid #dde3ed",
        padding: "10px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85" }}>
          {label}
        </span>
        <button
          onClick={onGenerate}
          disabled={generating || articles.length === 0}
          style={{
            fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
            background: generating ? "#f0f2f5" : "#1a1a1a",
            color: generating ? "#94a3b8" : "#fff",
            border: "none", borderRadius: "6px", padding: "5px 12px",
            cursor: (generating || articles.length === 0) ? "default" : "pointer",
          }}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* Article context list */}
      {articles.length > 0 && (
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0f2f5" }}>
          {articles.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "4px 0" }}>
              <span style={{ fontSize: "13px", color: "#1a1a1a", lineHeight: 1.4 }}>{a.title}</span>
              {a.article_type && (
                <span style={{
                  fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                  background: "#f0f2f5", color: "#5a6a85", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {a.article_type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div style={{ padding: "14px 16px" }}>
        {children}
      </div>
    </div>
  );
}
