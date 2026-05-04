import type { AllModeArticle } from "./types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ArticleRowCompact({ article, isLast }: { article: AllModeArticle; isLast: boolean }) {
  const url = article.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`
    : null;

  return (
    <div style={{
      display: "flex", gap: "8px", alignItems: "flex-start",
      padding: "9px 0",
      borderBottom: isLast ? "none" : "0.5px solid #f0f2f5",
    }}>
      {/* Pick marker — 60px fixed */}
      <div style={{
        width: "60px", flexShrink: 0,
        fontSize: "9px", fontWeight: 700,
        letterSpacing: "0.05em", textTransform: "uppercase",
        color: article.editors_pick ? "#94a3b8" : "transparent",
        paddingTop: "3px",
      }}>
        {article.editors_pick ? "★ PICK" : ""}
      </div>

      {/* Article info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "Georgia, serif",
          fontSize: "13px", lineHeight: 1.4, color: "#1a1a1a",
          marginBottom: "3px",
        }}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ color: "#1a1a1a", textDecoration: "none" }}>
              {article.title}
            </a>
          ) : article.title}
        </div>
        <div style={{ fontSize: "10px", color: "#94a3b8" }}>
          {[article.journal_abbr, fmtDate(article.pubmed_indexed_at), article.article_type]
            .filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}
