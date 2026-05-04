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

function fmtShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

export function EditionBand({ edition }: { edition: EditionData }) {
  const router = useRouter();
  const pubmedUrl = edition.lead_pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${edition.lead_pubmed_id}/`
    : null;

  return (
      <div
        onClick={() => router.push(`/editions/${edition.id}`)}
        style={{
        background: "#F5F1E8",
        border: "0.5px solid #E5DCC8",
        borderRadius: "12px",
        padding: "1.25rem 1.75rem",
        marginBottom: "0.75rem",
        display: "flex",
        alignItems: "flex-start",
        gap: "2rem",
        cursor: "pointer",
      }}>
        {/* Left: eyebrow + title + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: "10px",
          }}>
            Issue {edition.week_number} · Editors pick · {fmtShort(edition.published_at)}
          </div>
          <div style={{
            fontFamily: "Georgia, serif",
            fontSize: "18px", lineHeight: 1.35, color: "#1a1a1a", fontWeight: 400,
            marginBottom: (edition.lead_subheadline || edition.lead_sari_subject) ? "8px" : 0,
          }}>
            {pubmedUrl ? (
              <a
                href={pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: "#1a1a1a", textDecoration: "none" }}
              >
                {edition.lead_title ?? "This week&apos;s edition"}
              </a>
            ) : (edition.lead_title ?? "This week's edition")}
          </div>
          {edition.lead_subheadline ? (
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5, marginTop: "6px" }}>
              {edition.lead_subheadline}
            </div>
          ) : edition.lead_sari_subject ? (
            <div style={{
              fontSize: "12px", color: "#64748b", lineHeight: 1.5,
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {edition.lead_sari_subject}
            </div>
          ) : null}
        </div>

        {/* Right: picks + CTA */}
        <div style={{
          flexShrink: 0, textAlign: "right",
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px",
          paddingTop: "2px",
        }}>
          <div style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap" }}>
            {edition.total_picks} editors picks
          </div>
          <span style={{
            fontSize: "12px", fontWeight: 500, color: "#1a1a1a",
            textDecoration: "underline", whiteSpace: "nowrap",
          }}>
            Open this week's edition →
          </span>
        </div>
      </div>
  );
}
