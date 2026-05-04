import Link from "next/link";

export interface FreshArticle {
  id: string;
  title: string;
  pubmed_id: string | null;
  journal_abbr: string | null;
  pubmed_indexed_at: string | null;
}

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function FreshFromFeed({
  articles,
  totalToday,
  label,
}: {
  articles: FreshArticle[];
  totalToday: number;
  label: "Today" | "Yesterday";
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      border: "1px solid #e5e9f0",
      padding: "20px 24px",
      marginBottom: "16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: "4px",
          }}>
            Fresh from the feed
          </div>
          <div style={{
            fontFamily: "Georgia, serif",
            fontSize: "18px", fontWeight: 400, color: "#1a1a1a", lineHeight: 1.2,
          }}>
            {label}
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "right" }}>
          {totalToday > 0 && <span>{totalToday} new {label.toLowerCase()} · </span>}
          <Link href="/feed" style={{ color: "#64748b", textDecoration: "underline" }}>
            See full feed →
          </Link>
        </div>
      </div>

      {/* Article list */}
      <div>
        {articles.map((a, i) => {
          const url = a.pubmed_id ? `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/` : null;
          const isLast = i === articles.length - 1;
          return (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "12px",
                padding: "10px 0",
                borderBottom: isLast ? "none" : "0.5px solid #f0f2f5",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "14px", lineHeight: 1.4, color: "#1a1a1a",
                      textDecoration: "none",
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}
                  >
                    {a.title}
                  </a>
                ) : (
                  <span style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "14px", lineHeight: 1.4, color: "#1a1a1a",
                  }}>
                    {a.title}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: "10px", color: "#94a3b8",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {[a.journal_abbr, fmtTimeAgo(a.pubmed_indexed_at)].filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
