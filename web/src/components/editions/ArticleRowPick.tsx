import type { EditionArticle } from "./types";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function subMeta(subs: string[] | null, shortNames: Record<string, string>): string[] {
  if (!subs || subs.length === 0) return [];
  const labels = subs.map(n => shortNames[n] ?? n);
  if (labels.length <= 2) return labels;
  return [labels[0], labels[1], `+${labels.length - 2}`];
}

export function ArticleRowPick({
  article,
  isLast,
  isSpecialtyBlock,
  subShortNames,
}: {
  article: EditionArticle;
  isLast: boolean;
  isSpecialtyBlock: boolean;
  subShortNames: Record<string, string>;
}) {
  const url = article.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`
    : null;

  const title    = article.newsletter_headline || article.title;
  const subtitle = article.newsletter_subheadline || article.sari_subject;

  const metaParts = [
    ...(isSpecialtyBlock ? subMeta(article.articleSubspecialties, subShortNames) : []),
    article.journal_abbr,
    fmtDate(article.pubmed_indexed_at),
  ].filter(Boolean);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2px 1fr", gap: "18px",
      padding: "14px 0",
      borderBottom: isLast ? "none" : "0.5px solid #f0f2f5",
    }}>
      <div style={{ background: "#D94A43", borderRadius: "1px" }} />
      <div>
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
        <div style={{ fontSize: "11px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {article.article_type && (
            <span style={{
              background: "#F1F5F9", color: "#334155",
              fontSize: "10px", fontWeight: 500, letterSpacing: "0.02em",
              padding: "2px 9px", borderRadius: "999px",
            }}>
              {article.article_type}
            </span>
          )}
          {metaParts.join(" · ")}
        </div>
      </div>
    </div>
  );
}
