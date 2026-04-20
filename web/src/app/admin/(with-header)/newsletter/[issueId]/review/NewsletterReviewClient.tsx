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
  journal_abbr: string | null;
  pubmed_indexed_at: string | null;
  article_type: string | null;
  news_value: number | null;
  pubmed_id: string;
}

interface SectionItem {
  id: string; // newsletter_edition_articles.id
  article_id: string;
  title: string;
  journal_abbr: string | null;
  pubmed_indexed_at: string | null;
  article_type: string | null;
  news_value: number | null;
  is_global: boolean;
}

interface Props {
  edition: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null };
  subspecialties: Subspecialty[];
  editionArticles: EditionArticle[];
  articleDetails: ArticleDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShortDate(s: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  catch { return ""; }
}

function initSections(
  editionArticles: EditionArticle[],
  articleDetails: ArticleDetail[]
): Record<string, SectionItem[]> {
  const detailMap = new Map(articleDetails.map((a) => [a.id, a]));
  const grouped: Record<string, SectionItem[]> = {};

  for (const ea of editionArticles) {
    const detail = detailMap.get(ea.article_id);
    if (!detail) continue;
    if (!grouped[ea.subspecialty]) grouped[ea.subspecialty] = [];
    grouped[ea.subspecialty].push({
      id: ea.id,
      article_id: ea.article_id,
      title: detail.title,
      journal_abbr: detail.journal_abbr,
      pubmed_indexed_at: detail.pubmed_indexed_at,
      article_type: detail.article_type,
      news_value: detail.news_value,
      is_global: ea.is_global,
    });
  }

  return grouped;
}

const MAX_GLOBAL = 3;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterReviewClient({ edition, subspecialties, editionArticles, articleDetails }: Props) {
  const [sections, setSections] = useState<Record<string, SectionItem[]>>(() =>
    initSections(editionArticles, articleDetails)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const globalCount = useMemo(
    () => Object.values(sections).flat().filter((item) => item.is_global).length,
    [sections]
  );

  // Display order: named subspecialties by sort_order, then "No subspecialty"
  const sectionOrder = useMemo(() => {
    const named = subspecialties
      .map((s) => s.name)
      .filter((name) => (sections[name] ?? []).length > 0);
    const hasGeneral = (sections["No subspecialty"] ?? []).length > 0;
    return hasGeneral ? [...named, "No subspecialty"] : named;
  }, [subspecialties, sections]);

  function moveItem(subspecialty: string, index: number, direction: "up" | "down") {
    setSections((prev) => {
      const items = [...(prev[subspecialty] ?? [])];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= items.length) return prev;
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
      return { ...prev, [subspecialty]: items };
    });
  }

  function toggleGlobal(itemId: string) {
    setSections((prev) => {
      const allItems = Object.values(prev).flat();
      const target = allItems.find((item) => item.id === itemId);
      if (!target) return prev;

      // Toggle off if already global
      if (target.is_global) {
        const updated: Record<string, SectionItem[]> = {};
        for (const [sub, items] of Object.entries(prev)) {
          updated[sub] = items.map((item) =>
            item.id === itemId ? { ...item, is_global: false } : item
          );
        }
        return updated;
      }

      // No effect if max reached
      if (globalCount >= MAX_GLOBAL) return prev;

      // Toggle on
      const updated: Record<string, SectionItem[]> = {};
      for (const [sub, items] of Object.entries(prev)) {
        updated[sub] = items.map((item) =>
          item.id === itemId ? { ...item, is_global: true } : item
        );
      }
      return updated;
    });
  }

  async function removeArticle(subspecialty: string, itemId: string) {
    setSections((prev) => ({
      ...prev,
      [subspecialty]: (prev[subspecialty] ?? []).filter((item) => item.id !== itemId),
    }));
    const res = await fetch("/api/admin/newsletter/edition-article", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId }),
    });
    const json = await res.json();
    if (!json.ok) window.location.reload();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates = Object.values(sections).flatMap((items) =>
        items.map((item, idx) => ({ id: item.id, sort_order: idx, is_global: item.is_global }))
      );

      if (updates.length > 0) {
        const articlesRes = await fetch("/api/admin/newsletter/edition-article", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        const articlesJson = await articlesRes.json();
        if (!articlesJson.ok) throw new Error(articlesJson.error ?? `HTTP ${articlesRes.status}`);
      }
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
        <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Admin
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <Link href={`/admin/newsletter/${edition.id}/selection`} style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Selection
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Week {edition.week_number} · {edition.year}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontSize: "12px", fontWeight: 600,
            color: globalCount === MAX_GLOBAL ? "#059669" : "#94a3b8",
          }}>
            {globalCount}/{MAX_GLOBAL} global
          </span>
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
            href={`/admin/newsletter/${edition.id}/intro-texts`}
            style={{
              fontSize: "13px", fontWeight: 600,
              background: "#059669", color: "#fff",
              borderRadius: "7px", padding: "7px 16px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Intro texts →
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

        {/* Subspecialty sections */}
        {sectionOrder.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8", fontSize: "14px" }}>
            No articles selected yet.
          </div>
        ) : sectionOrder.map((sub) => {
          const items = sections[sub] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={sub} style={{ marginBottom: "32px" }}>
              <div style={{
                display: "flex", alignItems: "baseline", gap: "8px",
                marginBottom: "12px", paddingBottom: "8px",
                borderBottom: "2px solid #1a1a1a",
              }}>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>{sub}</span>
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                  ({items.length} article{items.length !== 1 ? "s" : ""})
                </span>
              </div>

              {items.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "12px",
                    padding: "12px 14px", marginBottom: "6px",
                    background: item.is_global ? "#f0fdf4" : "#fff",
                    border: `1px solid ${item.is_global ? "#86efac" : "#dde3ed"}`,
                    borderRadius: "8px",
                    transition: "background 0.1s, border-color 0.1s",
                  }}
                >
                  {/* Up / down */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0, paddingTop: "2px" }}>
                    <button
                      onClick={() => moveItem(sub, idx, "up")}
                      disabled={idx === 0}
                      style={{
                        fontSize: "11px", background: "none", border: "1px solid #e2e8f0",
                        borderRadius: "4px", padding: "2px 6px",
                        cursor: idx === 0 ? "default" : "pointer",
                        color: idx === 0 ? "#d1d5db" : "#5a6a85",
                        borderColor: idx === 0 ? "#f0f0f0" : "#e2e8f0",
                        lineHeight: 1, fontFamily: "inherit",
                      }}
                    >↑</button>
                    <button
                      onClick={() => moveItem(sub, idx, "down")}
                      disabled={idx === items.length - 1}
                      style={{
                        fontSize: "11px", background: "none", border: "1px solid #e2e8f0",
                        borderRadius: "4px", padding: "2px 6px",
                        cursor: idx === items.length - 1 ? "default" : "pointer",
                        color: idx === items.length - 1 ? "#d1d5db" : "#5a6a85",
                        borderColor: idx === items.length - 1 ? "#f0f0f0" : "#e2e8f0",
                        lineHeight: 1, fontFamily: "inherit",
                      }}
                    >↓</button>
                  </div>

                  {/* Article info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                      {idx === 0 && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em",
                          textTransform: "uppercase", color: "#94a3b8",
                        }}>
                          Lead
                        </span>
                      )}
                      <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.45, color: "#1a1a1a" }}>
                        {item.title}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {(item.journal_abbr || item.pubmed_indexed_at) && (
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                          {[item.journal_abbr, fmtShortDate(item.pubmed_indexed_at)].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {item.article_type && (
                        <span style={{
                          fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                          background: "#f0f2f5", color: "#5a6a85", fontWeight: 600,
                        }}>
                          {item.article_type}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Global + remove */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <button
                      onClick={() => toggleGlobal(item.id)}
                      disabled={!item.is_global && globalCount >= MAX_GLOBAL}
                      title={item.is_global ? "Remove from global" : globalCount >= MAX_GLOBAL ? "Max 3 global articles" : "Mark as global"}
                      style={{
                        fontSize: "11px", fontWeight: 600, fontFamily: "inherit",
                        padding: "3px 8px", borderRadius: "5px",
                        border: item.is_global ? "1px solid #86efac" : "1px solid #e2e8f0",
                        background: item.is_global ? "#dcfce7" : "none",
                        color: item.is_global ? "#15803d" : "#94a3b8",
                        cursor: (!item.is_global && globalCount >= MAX_GLOBAL) ? "default" : "pointer",
                        opacity: (!item.is_global && globalCount >= MAX_GLOBAL) ? 0.4 : 1,
                        transition: "all 0.15s",
                        lineHeight: 1.4,
                      }}
                    >
                      {item.is_global ? "Global ✓" : "Global"}
                    </button>
                    <button
                      onClick={() => removeArticle(sub, item.id)}
                      title="Remove from newsletter"
                      style={{
                        fontSize: "15px", background: "none", border: "1px solid #e2e8f0",
                        borderRadius: "5px", padding: "1px 8px", cursor: "pointer",
                        color: "#94a3b8", lineHeight: 1.4, fontFamily: "inherit",
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
