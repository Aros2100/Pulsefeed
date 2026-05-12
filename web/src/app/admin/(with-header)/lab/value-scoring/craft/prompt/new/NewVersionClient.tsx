"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  startingText:       string;
  startingChangeNotes?: string;
  startedFromVersion: number | null;
  parentPromptId:     string | null;
}

export default function NewVersionClient({ startingText, startingChangeNotes, startedFromVersion, parentPromptId }: Props) {
  const router = useRouter();
  const [promptText, setPromptText] = useState(startingText);
  const [changeNotes, setChangeNotes] = useState(startingChangeNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/prompt/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText, changeNotes, parentPromptId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Create failed");
        setBusy(false);
        return;
      }
      router.push(`/admin/lab/value-scoring/craft/prompt/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusy(false);
    }
  }

  return (
    <>
      {startedFromVersion !== null && (
        <div style={{ background: "#dbeafe", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "#1e40af" }}>
          Starting from v{startedFromVersion}.
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px" }}>
          Prompt text
        </label>
        <textarea
          value={promptText}
          onChange={e => setPromptText(e.target.value)}
          placeholder="Write the system prompt that scores an article…"
          style={{
            width: "100%",
            minHeight: "320px",
            padding: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "13px",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            resize: "vertical",
            color: "#1a1a1a",
            background: "#fff",
          }}
        />
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#94a3b8" }}>
          The prompt is sent as the system message. The article fields (title, journal, article type, headline, resume, bottom line, SARI) are appended as the user message. Instruct the model to return JSON of the form {"{\"score\": <number>, \"reasoning\": <string>}"}.
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px" }}>
          Change notes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#94a3b8" }}>(optional)</span>
        </label>
        <textarea
          value={changeNotes}
          onChange={e => setChangeNotes(e.target.value)}
          placeholder="What changed compared to the previous version?"
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "10px",
            fontSize: "13px",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            resize: "vertical",
            color: "#1a1a1a",
            background: "#fff",
          }}
        />
      </div>

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/admin/lab/value-scoring/craft/prompt" style={{ fontSize: "13px", color: "#94a3b8", textDecoration: "none" }}>
          ← Cancel
        </Link>
        <button
          onClick={submit}
          disabled={busy || promptText.trim().length === 0}
          style={{
            background: busy || promptText.trim().length === 0 ? "#fda99e" : "#E83B2A",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "10px 18px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: busy || promptText.trim().length === 0 ? "default" : "pointer",
          }}
        >
          {busy ? "Creating…" : "Create version"}
        </button>
      </div>
    </>
  );
}
