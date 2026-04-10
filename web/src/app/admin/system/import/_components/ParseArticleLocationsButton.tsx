"use client";

import { useState } from "react";

type State =
  | { phase: "idle" }
  | { phase: "running"; parsed: number }
  | { phase: "done"; parsed: number }
  | { phase: "error"; message: string };

export function ParseArticleLocationsButton() {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run() {
    setState({ phase: "running", parsed: 0 });
    let totalParsed = 0;

    try {
      while (true) {
        const res = await fetch("/api/admin/run-location-scorer", { method: "POST" });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        totalParsed += data.parsed ?? 0;
        setState({ phase: "running", parsed: totalParsed });

        if (data.done) break;
      }

      setState({ phase: "done", parsed: totalParsed });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const isRunning = state.phase === "running";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <button
        onClick={run}
        disabled={isRunning}
        style={{
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 600,
          borderRadius: "6px",
          border: "none",
          background: isRunning ? "#e5e7eb" : "#E83B2A",
          color: isRunning ? "#9ca3af" : "#fff",
          cursor: isRunning ? "not-allowed" : "pointer",
        }}
      >
        Parse article locations
      </button>

      {state.phase === "running" && (
        <span style={{ fontSize: "13px", color: "#5a6a85" }}>
          Kører... ({state.parsed} parset)
        </span>
      )}
      {state.phase === "done" && (
        <span style={{ fontSize: "13px", color: "#15803d", fontWeight: 600 }}>
          Færdig — {state.parsed} artikler parset
        </span>
      )}
      {state.phase === "error" && (
        <span style={{ fontSize: "13px", color: "#b91c1c" }}>
          Fejl: {state.message}
        </span>
      )}
    </div>
  );
}
