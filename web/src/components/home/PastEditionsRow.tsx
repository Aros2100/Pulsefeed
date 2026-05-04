import Link from "next/link";
import type { EditionData } from "./EditionBand";

function fmtShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

export function PastEditionsRow({
  editions,
  latestEditionId,
}: {
  editions: EditionData[];
  latestEditionId: string;
}) {
  if (editions.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: "10px",
      }}>
        <div style={{
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#94a3b8",
        }}>
          Past editions
        </div>
        <Link href="/editions" style={{
          fontSize: "11px", color: "#64748b", textDecoration: "underline",
          fontWeight: 500,
        }}>
          All editions →
        </Link>
      </div>

      {/* Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${editions.length}, 1fr)`,
        gap: "12px",
      }}>
        {editions.map((e) => (
          <Link
            key={e.id}
            href={`/editions/${e.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{
              background: "#fff",
              border: "0.5px solid #e5e9f0",
              borderRadius: "12px",
              padding: "1rem 1.1rem",
              cursor: "pointer",
              height: "100%",
              boxSizing: "border-box",
            }}>
              <div style={{
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em",
                textTransform: "uppercase", color: "#94a3b8", marginBottom: "8px",
              }}>
                Issue {e.week_number} · {fmtShort(e.published_at)}
              </div>
              <div style={{
                fontFamily: "Georgia, serif",
                fontSize: "14px", lineHeight: 1.4, color: "#1a1a1a", fontWeight: 400,
                marginBottom: "10px",
                display: "-webkit-box", WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {e.lead_title ?? "—"}
              </div>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                {e.total_picks} editors picks
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
