"use client";
import { useRouter } from "next/navigation";

export interface EditionData {
  id: string;
  week_number: number;
  year: number;
  published_at: string | null;
  lead_title: string | null;
  lead_pubmed_id: string | null;
  lead_sari_subject: string | null;
  lead_subheadline: string | null;
  total_picks: number;
}

const DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function fmtMastheadDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function EditionBand({ edition }: { edition: EditionData }) {
  const router = useRouter();

  const subheadline = edition.lead_subheadline || null;

  return (
    <div
      onClick={() => router.push(`/editions/${edition.id}`)}
      style={{
        background: "#F5F1E8",
        border: "0.5px solid rgba(0,0,0,0.06)",
        borderRadius: "12px",
        marginBottom: "1.5rem",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Red rule — full-height left edge */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: "3px", background: "#D94A43",
      }} />

      {/* Masthead strip */}
      <div style={{
        padding: "14px 1.75rem 12px",
        borderBottom: "0.5px solid rgba(0,0,0,0.08)",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}>
          <span style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic", fontSize: "14px", fontWeight: 400, color: "#D94A43",
          }}>
            The Edition
          </span>
          <span style={{
            fontSize: "10px", letterSpacing: "0.12em", color: "#94a3b8",
            textTransform: "uppercase",
          }}>
            № {edition.week_number} · {fmtMastheadDate(edition.published_at)}
          </span>
        </div>
        <span style={{
          fontSize: "10px", letterSpacing: "0.08em", color: "#94a3b8",
          textTransform: "uppercase",
        }}>
          {edition.total_picks} editors picks this week
        </span>
      </div>

      {/* Main content */}
      <div style={{
        padding: "1.5rem 1.75rem 1.75rem",
        display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "center",
      }}>
        {/* Left: eyebrow + title + subheadline */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: "10px", fontWeight: 500, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#D94A43", marginBottom: "10px",
          }}>
            Lead · Editors pick
          </div>

          <div style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "26px", lineHeight: 1.25, letterSpacing: "-0.01em",
            color: "#1a1a1a", fontWeight: 400,
            marginBottom: subheadline ? "10px" : 0,
          }}>
            {edition.lead_title ?? "This week's edition"}
          </div>

          {subheadline && (
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic", fontSize: "15px", lineHeight: 1.45,
              color: "#475569",
            }}>
              {subheadline}
            </div>
          )}
        </div>

        {/* Right: CTA button */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/editions/${edition.id}`); }}
            style={{
              background: "#D94A43", color: "#fff", border: "none",
              padding: "11px 22px", borderRadius: "6px",
              fontSize: "12px", fontWeight: 500, letterSpacing: "0.04em",
              whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 1px 2px rgba(217,74,67,0.2)",
            }}
          >
            Open this week&apos;s edition →
          </button>
        </div>
      </div>
    </div>
  );
}
