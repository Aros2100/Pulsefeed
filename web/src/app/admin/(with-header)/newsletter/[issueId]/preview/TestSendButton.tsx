"use client";
import { useState } from "react";

const LS_KEY = "pf_test_email";

export default function TestSendButton({ editionId }: { editionId: string }) {
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem(LS_KEY) ?? "") : ""
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!email) return;
    setSending(true);
    setError(null);
    localStorage.setItem(LS_KEY, email);
    try {
      const res = await fetch("/api/admin/newsletter/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, email }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSent(true);
      setShowInput(false);
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#059669" }}>
        Sent ✓
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {showInput && (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="email@example.com"
            autoFocus
            style={{
              fontSize: "13px", fontFamily: "inherit",
              border: "1px solid #dde3ed", borderRadius: "6px",
              padding: "6px 10px", outline: "none",
              width: "200px", color: "#1a1a1a",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !email}
            style={{
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              background: sending ? "#94a3b8" : "#5a6a85", color: "#fff",
              border: "none", borderRadius: "6px", padding: "6px 12px",
              cursor: (sending || !email) ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </>
      )}
      {error && (
        <span style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</span>
      )}
      <button
        onClick={() => { setShowInput((v) => !v); setError(null); }}
        style={{
          fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
          background: "none", color: "#5a6a85",
          border: "1px solid #dde3ed", borderRadius: "6px",
          padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        Send test
      </button>
    </div>
  );
}
