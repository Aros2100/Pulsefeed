"use client";
import { useRouter } from "next/navigation";
import type { Edition } from "./types";
import { fmtShortDate } from "./types";

export function EditionHeader({
  edition,
  isLatest,
  prevEditionId,
  nextEditionId,
  totalPicks,
  totalArticles,
  currentBlock,
  currentView,
}: {
  edition: Edition;
  isLatest: boolean;
  prevEditionId: string | null;
  nextEditionId: string | null;
  totalPicks: number;
  totalArticles: number;
  currentBlock: string;
  currentView: string;
}) {
  const router = useRouter();

  function navigate(id: string) {
    const params = new URLSearchParams();
    if (currentBlock !== "specialty") params.set("block", currentBlock);
    if (currentView !== "picks") params.set("view", currentView);
    const qs = params.toString();
    router.push(`/editions/${id}${qs ? `?${qs}` : ""}`);
  }

  const arrowStyle = (enabled: boolean): React.CSSProperties => ({
    fontSize: "18px", fontWeight: 300, color: "#94a3b8",
    background: "none", border: "none", cursor: enabled ? "pointer" : "default",
    padding: "4px 8px", fontFamily: "inherit",
    opacity: enabled ? 1 : 0.35,
    flexShrink: 0,
  });

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid #e5e9f0",
      borderRadius: "12px",
      padding: "1.5rem 1.75rem",
      marginBottom: "1rem",
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      gap: "24px",
    }}>
      {/* Left: empty */}
      <div />

      {/* Center: arrows flanking title block */}
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <button
          style={arrowStyle(!!prevEditionId)}
          onClick={() => prevEditionId && navigate(prevEditionId)}
          disabled={!prevEditionId}
          aria-label="Previous edition"
        >
          ‹
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: "4px",
          }}>
            Issue {edition.week_number} · Week {edition.week_number}, {edition.year}
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "28px", lineHeight: 1.1, color: "#1a1a1a", fontWeight: 400 }}>
            {isLatest ? "This week's edition" : `Issue ${edition.week_number}`}
          </div>
        </div>

        <button
          style={arrowStyle(!!nextEditionId)}
          onClick={() => nextEditionId && navigate(nextEditionId)}
          disabled={!nextEditionId}
          aria-label="Next edition"
        >
          ›
        </button>
      </div>

      {/* Right: date + counts */}
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: "Georgia, serif", fontStyle: "italic",
          fontSize: "12px", color: "#64748b", marginBottom: "3px",
        }}>
          {fmtShortDate(edition.published_at)}
        </div>
        <div style={{ fontSize: "11px", color: "#94a3b8" }}>
          {totalPicks} editors picks out of {totalArticles}
        </div>
      </div>
    </div>
  );
}
