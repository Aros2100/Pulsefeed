"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EditionData } from "./EditionBand";

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function fmtCardDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function PastEditionsRow({
  editions,
  latestEditionId: _latestEditionId,
}: {
  editions: EditionData[];
  latestEditionId: string;
}) {
  const router = useRouter();
  if (editions.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        padding: "0 4px", marginBottom: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}>
          <span style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic", fontSize: "13px", fontWeight: 400, color: "#1a1a1a",
          }}>
            From the archive
          </span>
          <span style={{
            fontSize: "9px", letterSpacing: "0.12em", color: "#94a3b8",
            textTransform: "uppercase",
          }}>
            Past editions
          </span>
        </div>
        <Link href="/editions" style={{ fontSize: "11px", color: "#64748b", cursor: "pointer", textDecoration: "none" }}>
          All editions →
        </Link>
      </div>

      {/* Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${editions.length}, 1fr)`,
        gap: "14px",
      }}>
        {editions.map((e) => (
          <div
            key={e.id}
            onClick={() => router.push(`/editions/${e.id}`)}
            style={{
              background: "#FAF7F0",
              border: "0.5px solid rgba(0,0,0,0.06)",
              borderRadius: "8px",
              padding: "1rem 1.1rem 1.1rem",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {/* Top row: № N + date */}
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              paddingBottom: "8px",
              borderBottom: "0.5px solid rgba(0,0,0,0.08)",
              marginBottom: "10px",
            }}>
              <span style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic", fontSize: "13px", color: "#D94A43", fontWeight: 400,
              }}>
                № {e.week_number}
              </span>
              <span style={{
                fontSize: "9px", letterSpacing: "0.08em", color: "#94a3b8",
                textTransform: "uppercase",
              }}>
                {fmtCardDate(e.published_at)}
              </span>
            </div>

            {/* Lead title */}
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "14px", lineHeight: 1.35, color: "#1a1a1a", fontWeight: 400,
              marginBottom: "12px",
              minHeight: "56px",
              display: "-webkit-box", WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {e.lead_title ?? "—"}
            </div>

            {/* Footer */}
            <div style={{
              fontSize: "10px", letterSpacing: "0.04em", color: "#94a3b8",
              textTransform: "uppercase",
            }}>
              {e.total_picks} editors picks
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
