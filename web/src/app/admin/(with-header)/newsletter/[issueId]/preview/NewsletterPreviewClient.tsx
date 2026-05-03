"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TestSendButton from "./TestSendButton";

interface Props {
  editionId: string;
  weekNumber: number;
  year: number;
  saturdayLabel: string;
}

export default function NewsletterPreviewClient({ editionId, weekNumber, year, saturdayLabel }: Props) {
  const router = useRouter();
  const [subCount, setSubCount] = useState<1 | 2 | 3>(2);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchHtml = useCallback(async (preset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/newsletter/${editionId}/preview-html?subPreset=${preset}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      setHtml(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [editionId]);

  useEffect(() => { fetchHtml(subCount); }, [subCount, fetchHtml]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentDocument?.body) {
      iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
    }
  }, []);

  async function approve() {
    setApproving(true);
    try {
      const res = await fetch("/api/admin/newsletter/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editionId, status: "approved" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      router.push(`/admin/newsletter/${editionId}/send`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
      setApproving(false);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#e8ecf0", color: "#1a1a1a", minHeight: "100vh" }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: "52px", background: "#fff", borderBottom: "1px solid #dde3ed",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "14px",
        position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <Link
          href={`/admin/newsletter/${editionId}/sub-headlines`}
          style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← Sub-headlines
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Week {weekNumber} · {year} · {saturdayLabel}
        </span>

        {/* Subscriber preset selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "8px" }}>
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => setSubCount(n)}
              style={{
                fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                padding: "4px 10px", borderRadius: "6px",
                border: `1px solid ${subCount === n ? "#1a1a1a" : "#dde3ed"}`,
                background: subCount === n ? "#1a1a1a" : "#fff",
                color: subCount === n ? "#fff" : "#5a6a85",
                cursor: "pointer",
              }}
            >
              {n} sub
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <TestSendButton editionId={editionId} />
          <button
            onClick={approve}
            disabled={approving}
            style={{
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              background: approving ? "#94a3b8" : "#059669", color: "#fff",
              border: "none", borderRadius: "7px", padding: "7px 16px",
              cursor: approving ? "default" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {approving ? "Approving…" : "Approve →"}
          </button>
        </div>
      </div>

      {/* ── Email preview ────────────────────────────────────────────────────── */}
      <div style={{ padding: "32px 24px 80px" }}>
        {error ? (
          <div style={{ maxWidth: "620px", margin: "0 auto", padding: "24px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ maxWidth: "620px", margin: "0 auto", padding: "48px", textAlign: "center", fontSize: "13px", color: "#94a3b8" }}>
            Loading preview…
          </div>
        ) : (
          <div style={{
            maxWidth: "620px", margin: "0 auto",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            overflow: "hidden",
            background: "#fff",
          }}>
            <iframe
              ref={iframeRef}
              srcDoc={html}
              style={{ width: "100%", border: "none", display: "block", minHeight: "600px" }}
              onLoad={handleIframeLoad}
            />
          </div>
        )}
      </div>
    </div>
  );
}
