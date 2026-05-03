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
  global_sort_order: number | null;
  comment: string | null;
}

interface ArticleDetail {
  id: string;
  title: string;
  article_type: string | null;
  sari_subject: string | null;
  sari_action: string | null;
  sari_result: string | null;
  sari_implication: string | null;
}

interface ArticleItem {
  editionId: string; // newsletter_edition_articles.id
  articleId: string;
  title: string;
  sari_subject: string | null;
  sari_action: string | null;
  sari_result: string | null;
  sari_implication: string | null;
  subspecialty?: string;
}

interface Props {
  edition: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null };
  subspecialties: Subspecialty[];
  editionArticles: EditionArticle[];
  articleDetails: ArticleDetail[];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: "100%", fontSize: "14px", lineHeight: 1.7,
  border: "1px solid #dde3ed", borderRadius: "8px",
  padding: "12px 14px", resize: "vertical",
  fontFamily: "inherit", color: "#1a1a1a",
  background: "#fff", outline: "none",
  boxSizing: "border-box",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterAiClient({ edition, subspecialties, editionArticles, articleDetails }: Props) {
  const detailMap = useMemo(
    () => new Map(articleDetails.map((a) => [a.id, a])),
    [articleDetails]
  );

  // Global articles sorted by global_sort_order
  const globalItems = useMemo((): ArticleItem[] => {
    return editionArticles
      .filter((ea) => ea.is_global)
      .sort((a, b) => (a.global_sort_order ?? 0) - (b.global_sort_order ?? 0))
      .flatMap((ea) => {
        const detail = detailMap.get(ea.article_id);
        if (!detail) return [];
        return [{ editionId: ea.id, articleId: ea.article_id, title: detail.title,
          sari_subject: detail.sari_subject, sari_action: detail.sari_action,
          sari_result: detail.sari_result, sari_implication: detail.sari_implication }];
      });
  }, [editionArticles, detailMap]);

  // Lead article (sort_order=0) per subspecialty, in subspecialty sort_order
  const leadItems = useMemo((): ArticleItem[] => {
    const subOrder = new Map(subspecialties.map((s) => [s.name, s.sort_order]));
    const leads: ArticleItem[] = [];
    const bySubspecialty: Record<string, EditionArticle[]> = {};
    for (const ea of editionArticles) {
      if (!bySubspecialty[ea.subspecialty]) bySubspecialty[ea.subspecialty] = [];
      bySubspecialty[ea.subspecialty].push(ea);
    }
    const subNames = Object.keys(bySubspecialty).sort(
      (a, b) => (subOrder.get(a) ?? 999) - (subOrder.get(b) ?? 999)
    );
    for (const sub of subNames) {
      const sorted = bySubspecialty[sub].sort((a, b) => a.sort_order - b.sort_order);
      const lead = sorted[0];
      const detail = detailMap.get(lead.article_id);
      if (!detail) continue;
      leads.push({ editionId: lead.id, articleId: lead.article_id, title: detail.title,
        sari_subject: detail.sari_subject, sari_action: detail.sari_action,
        sari_result: detail.sari_result, sari_implication: detail.sari_implication,
        subspecialty: sub });
    }
    return leads;
  }, [editionArticles, subspecialties, detailMap]);

  // texts: keyed by newsletter_edition_articles.id
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const ea of editionArticles) {
      if (ea.comment) init[ea.id] = ea.comment;
    }
    return init;
  });

  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function generate(editionArticleId: string, item: ArticleItem) {
    if (!item.sari_subject || !item.sari_action || !item.sari_result || !item.sari_implication) {
      alert("This article has no SARI summary yet.");
      return;
    }
    setGenerating((prev) => ({ ...prev, [editionArticleId]: true }));
    try {
      const res = await fetch("/api/admin/newsletter/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "article",
          sari: {
            subject:     item.sari_subject,
            action:      item.sari_action,
            result:      item.sari_result,
            implication: item.sari_implication,
          },
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTexts((prev) => ({ ...prev, [editionArticleId]: json.text }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating((prev) => ({ ...prev, [editionArticleId]: false }));
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates = Object.entries(texts).map(([id, comment]) => ({ id, comment }));
      if (updates.length === 0) return;
      const res = await fetch("/api/admin/newsletter/edition-article", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
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

        {/* Global articles */}
        {globalItems.length > 0 && (
          <div style={{ marginBottom: "36px" }}>
            <div style={{
              fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
              textTransform: "uppercase", color: "#059669", marginBottom: "14px",
            }}>
              Global articles
            </div>
            {globalItems.map((item) => (
              <ArticleCard
                key={item.editionId}
                item={item}
                text={texts[item.editionId] ?? ""}
                generating={!!generating[item.editionId]}
                onChange={(v) => setTexts((prev) => ({ ...prev, [item.editionId]: v }))}
                onGenerate={() => generate(item.editionId, item)}
              />
            ))}
          </div>
        )}

        {/* Subspecialty leads */}
        {leadItems.length > 0 && (
          <div>
            <div style={{
              fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
              textTransform: "uppercase", color: "#5a6a85", marginBottom: "14px",
            }}>
              Subspecialty leads
            </div>
            {leadItems.map((item) => (
              <ArticleCard
                key={item.editionId}
                item={item}
                text={texts[item.editionId] ?? ""}
                generating={!!generating[item.editionId]}
                onChange={(v) => setTexts((prev) => ({ ...prev, [item.editionId]: v }))}
                onGenerate={() => generate(item.editionId, item)}
              />
            ))}
          </div>
        )}

        {globalItems.length === 0 && leadItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8", fontSize: "14px" }}>
            No articles selected yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ── ArticleCard ───────────────────────────────────────────────────────────────

function ArticleCard({
  item,
  text,
  generating,
  onChange,
  onGenerate,
}: {
  item: ArticleItem;
  text: string;
  generating: boolean;
  onChange: (v: string) => void;
  onGenerate: () => void;
}) {
  const hasSari = !!(item.sari_subject && item.sari_action && item.sari_result && item.sari_implication);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #dde3ed",
      borderRadius: "10px",
      marginBottom: "14px",
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        background: "#f8f9fb",
        borderBottom: "1px solid #dde3ed",
        padding: "10px 16px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {item.subspecialty && (
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "3px" }}>
              {item.subspecialty}
            </div>
          )}
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4 }}>
            {item.title}
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating || !hasSari}
          title={!hasSari ? "No SARI summary available" : undefined}
          style={{
            fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
            background: generating ? "#f0f2f5" : "#1a1a1a",
            color: generating ? "#94a3b8" : "#fff",
            border: "none", borderRadius: "6px", padding: "5px 12px",
            cursor: (generating || !hasSari) ? "default" : "pointer",
            opacity: !hasSari && !generating ? 0.4 : 1,
            whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* Textarea */}
      <div style={{ padding: "14px 16px" }}>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="One-sentence summary for this article…"
          rows={2}
          style={textareaStyle}
        />
      </div>
    </div>
  );
}
