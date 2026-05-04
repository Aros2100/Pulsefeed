import type { EditionArticle } from "./types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ArticleRowPick({ article, isLast }: { article: EditionArticle; isLast: boolean }) {
  const url = article.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`
    : null;

  const title = article.newsletter_headline || article.title;
  const subtitle = article.newsletter_subheadline || article.sari_subject;

  return (
    <div style={{
      padding: "14px 0",
      borderBottom: isLast ? "none" : "0.5px solid #f0f2f5",
    }}>
      <div style={{
        fontFamily: "Georgia, serif",
        fontSize: "15px", lineHeight: 1.4, color: "#1a1a1a",
        marginBottom: subtitle ? "6px" : 0,
      }}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ color: "#1a1a1a", textDecoration: "none" }}>
            {title}
          </a>
        ) : title}
      </div>
      {subtitle && (
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5, marginBottom: "6px" }}>
          {subtitle}
        </div>
      )}
      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
        {[article.journal_abbr, fmtDate(article.pubmed_indexed_at)].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}
