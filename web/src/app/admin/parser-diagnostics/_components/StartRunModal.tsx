"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  padding: "8px 12px",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#5a6a85",
  marginBottom: "5px",
};

interface RunResult {
  run_id?: string;
  run_name?: string;
  total?: number;
  successful_parses?: number;
  null_returns?: number;
  errors?: number;
  with_country?: number;
  with_city?: number;
  high_confidence?: number;
  mean_duration_ms?: number;
  total_duration_ms?: number;
  error?: string;
}

export function StartRunModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [runName, setRunName] = useState("");
  const [runNotes, setRunNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  function openModal() {
    setOpen(true);
    setResult(null);
  }

  function closeModal() {
    if (running) return;
    setOpen(false);
    setRunName("");
    setRunNotes("");
    setResult(null);
  }

  async function startRun() {
    if (!runName.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/parser-diagnostics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_name: runName.trim(), run_notes: runNotes.trim() || undefined }),
      });
      const data: RunResult = await res.json();
      setResult(data);
      if (!data.error) {
        router.refresh();
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        style={{
          padding: "9px 18px",
          borderRadius: "7px",
          border: "none",
          background: "#1a1a1a",
          color: "#fff",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Start new run
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: "#fff", borderRadius: "12px", width: "460px",
            maxWidth: "calc(100vw - 32px)", padding: "28px 28px 24px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <h2 style={{ margin: "0 0 20px", fontSize: "17px", fontWeight: 700 }}>
              Start new diagnostic run
            </h2>

            {!running && !result && (
              <>
                <div style={{ marginBottom: "14px" }}>
                  <label style={labelStyle}>Run name <span style={{ color: "#dc2626" }}>*</span></label>
                  <input
                    style={INPUT_STYLE}
                    value={runName}
                    onChange={(e) => setRunName(e.target.value)}
                    placeholder="e.g. baseline, after-city-fix"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && runName.trim()) startRun(); }}
                  />
                </div>
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea
                    style={{ ...INPUT_STYLE, resize: "vertical", minHeight: "72px" }}
                    value={runNotes}
                    onChange={(e) => setRunNotes(e.target.value)}
                    placeholder="Describe what changed since the last run…"
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={closeModal}
                    style={{
                      padding: "8px 16px", borderRadius: "7px",
                      border: "1px solid #d1d5db", background: "transparent",
                      fontFamily: "inherit", fontSize: "13px", cursor: "pointer", color: "#374151",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startRun}
                    disabled={!runName.trim()}
                    style={{
                      padding: "8px 18px", borderRadius: "7px", border: "none",
                      background: runName.trim() ? "#1a1a1a" : "#e5e7eb",
                      color: runName.trim() ? "#fff" : "#9ca3af",
                      fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                      cursor: runName.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Run
                  </button>
                </div>
              </>
            )}

            {running && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>⏳</div>
                <p style={{ margin: 0, fontSize: "14px", color: "#5a6a85" }}>
                  Running… this may take up to a minute.
                </p>
              </div>
            )}

            {result && !running && (
              <>
                {result.error ? (
                  <div style={{
                    padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5",
                    borderRadius: "8px", fontSize: "13px", color: "#b91c1c", marginBottom: "16px",
                  }}>
                    {result.error}
                  </div>
                ) : (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{
                      padding: "14px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0",
                      borderRadius: "8px", marginBottom: "14px",
                    }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#15803d", marginBottom: "8px" }}>
                        Run complete — {result.total} rows stored
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: "12px", color: "#374151" }}>
                        <span>Successful parses: <b>{result.successful_parses}</b></span>
                        <span>Null returns: <b>{result.null_returns}</b></span>
                        <span>With country: <b>{result.with_country}</b></span>
                        <span>With city: <b>{result.with_city}</b></span>
                        <span>High confidence: <b>{result.high_confidence}</b></span>
                        <span>Errors: <b>{result.errors}</b></span>
                        <span>Mean duration: <b>{result.mean_duration_ms}ms</b></span>
                        <span>Total: <b>{result.total_duration_ms}ms</b></span>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={closeModal}
                    style={{
                      padding: "8px 16px", borderRadius: "7px",
                      border: "1px solid #d1d5db", background: "transparent",
                      fontFamily: "inherit", fontSize: "13px", cursor: "pointer", color: "#374151",
                    }}
                  >
                    Close
                  </button>
                  {result.run_id && (
                    <a
                      href={`/admin/parser-diagnostics/${result.run_id}`}
                      style={{
                        padding: "8px 18px", borderRadius: "7px", border: "none",
                        background: "#1a1a1a", color: "#fff",
                        fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                        textDecoration: "none", display: "inline-block",
                      }}
                    >
                      View results →
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
