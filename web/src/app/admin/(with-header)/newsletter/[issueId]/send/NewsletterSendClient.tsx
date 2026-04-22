"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Edition {
  id: string;
  week_number: number;
  year: number;
  status: string;
  content: Record<string, unknown> | null;
}

interface Props {
  edition: Edition;
  recipientCount: number;
}

function weekSaturdayIso(week: number, year: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  // Format as "YYYY-MM-DDTHH:mm" for datetime-local input (local time, 08:00)
  const y = saturday.getUTCFullYear();
  const m = String(saturday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(saturday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T08:00`;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  padding: "9px 12px",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  color: "#1a1a1a",
  background: "#fff",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "160px 1fr",
      alignItems: "start",
      gap: 16,
      padding: "14px 0",
      borderBottom: "1px solid #f3f4f6",
    }}>
      <span style={{ fontSize: "13px", color: "#6b7280", paddingTop: 10 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export default function NewsletterSendClient({ edition, recipientCount }: Props) {
  const router = useRouter();

  const defaultSat = useMemo(() => weekSaturdayIso(edition.week_number, edition.year), [edition.week_number, edition.year]);

  const [from, setFrom] = useState("PulseFeed <newsletter@pulsefeed.dk>");
  const [subject, setSubject] = useState(`PulseFeed · Week ${edition.week_number} · ${edition.year}`);
  const [scheduledAt, setScheduledAt] = useState(defaultSat);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = scheduledAt.trim() !== "";

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId:   edition.id,
          from,
          subject,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Send failed");
      router.push("/admin/newsletter");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setSending(false);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1a1a1a", minHeight: "100vh", background: "#f5f7fa" }}>

      {/* Topbar */}
      <div style={{
        height: 52,
        background: "#fff",
        borderBottom: "1px solid #dde3ed",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={`/admin/newsletter/${edition.id}/preview`}
            style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}
          >
            ← Preview
          </Link>
          <span style={{ color: "#dde3ed" }}>·</span>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>
            Week {edition.week_number} · {edition.year}
          </span>
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          style={{
            padding: "8px 20px",
            borderRadius: "7px",
            border: "none",
            background: canSend && !sending ? "#15803d" : "#d1d5db",
            color: canSend && !sending ? "#fff" : "#9ca3af",
            fontSize: "13px",
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: canSend && !sending ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >
          {sending ? "Sending…" : "Send now →"}
        </button>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          {/* Card header */}
          <div style={{
            background: "#f9fafb",
            borderBottom: "1px solid #f3f4f6",
            padding: "16px 24px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em", color: "#5a6a85", textTransform: "uppercase" }}>
              Send edition
            </div>
          </div>

          {/* Rows */}
          <div style={{ padding: "0 24px" }}>

            {/* Recipients */}
            <Row label="Recipients">
              <div style={{ display: "flex", alignItems: "center", height: 38 }}>
                <span style={{ fontSize: "14px", color: "#1a1a1a" }}>
                  <strong>{recipientCount}</strong> subscriber{recipientCount !== 1 ? "s" : ""} will receive this edition
                </span>
              </div>
            </Row>

            {/* From */}
            <Row label="From">
              <input
                style={INPUT_STYLE}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Row>

            {/* Subject */}
            <Row label="Subject line">
              <input
                style={INPUT_STYLE}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </Row>

            {/* Scheduled send */}
            <Row label="Scheduled send">
              <input
                type="datetime-local"
                style={INPUT_STYLE}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Row>

            {/* Preview link */}
            <Row label="Preview">
              <div style={{ display: "flex", alignItems: "center", height: 38 }}>
                <Link
                  href={`/admin/newsletter/${edition.id}/preview`}
                  style={{ fontSize: "14px", color: "#5a6a85", textDecoration: "none", fontWeight: 600 }}
                >
                  View preview →
                </Link>
              </div>
            </Row>

          </div>

          {error && (
            <div style={{ margin: "0 24px 16px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", fontSize: "13px", color: "#b91c1c" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
