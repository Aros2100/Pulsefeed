"use client";

import { useState, useEffect, useRef } from "react";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; scored: number; total: number; startedAt: string }
  | { kind: "done"; scored: number; approved: number; rejected: number; failed: number; total: number }
  | { kind: "error"; message: string };

type StoredPhase = Exclude<Phase, { kind: "idle" }>;

const btnBase: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: "13px",
  fontWeight: 600,
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
};

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: "#e5e7eb", borderRadius: "4px", height: "6px", width: "100%", overflow: "hidden" }}>
      <div style={{ background: "#E83B2A", height: "100%", width: `${pct}%`, transition: "width 0.3s" }} />
    </div>
  );
}

export function ScoringClient({
  specialty,
  module: mod,
  pendingCount,
  apiRoute,
  requestBody,
  showLimit = true,
}: {
  specialty: string;
  module: string;
  version: string;
  pendingCount: number;
  apiRoute: string;
  requestBody: Record<string, unknown>;
  showLimit?: boolean;
}) {
  const storageKey = `scoring_run_${specialty}_${mod}`;
  const [phase, setPhaseRaw] = useState<Phase>({ kind: "idle" });
  const [limit, setLimit] = useState<number>(pendingCount);
  const [sessionActive, setSessionActive] = useState(false);
  const [edatFrom, setEdatFrom] = useState("");
  const [edatTo, setEdatTo] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: StoredPhase = JSON.parse(stored);
        // Stale "running" entries (>1h) are shown as-is so user can see it was interrupted
        setPhaseRaw(parsed);
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist phase to localStorage whenever it changes
  function setPhase(next: Phase) {
    setPhaseRaw(next);
    try {
      if (next.kind === "idle") {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
    } catch {
      // ignore
    }
  }

  async function run() {
    const effectiveLimit = Math.min(limit, pendingCount);
    if (effectiveLimit === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setSessionActive(true);
    setPhase({ kind: "running", scored: 0, total: effectiveLimit, startedAt: new Date().toISOString() });

    try {
      const bodyObj: Record<string, unknown> = {
        ...requestBody,
        scoreAll: false,
        ...(edatFrom && edatTo ? { edat_from: edatFrom, edat_to: edatTo } : {}),
      };
      if (showLimit) bodyObj.limit = effectiveLimit;
      const res = await fetch(apiRoute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.done) {
              setPhase({
                kind: "done",
                scored: event.scored ?? 0,
                approved: event.approved ?? 0,
                rejected: event.rejected ?? 0,
                failed: event.failed ?? 0,
                total: event.total ?? effectiveLimit,
              });
            } else {
              setPhase({
                kind: "running",
                scored: event.scored ?? 0,
                total: event.total ?? effectiveLimit,
                startedAt: new Date().toISOString(),
              });
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function reset() {
    abortRef.current?.abort();
    setSessionActive(false);
    setPhase({ kind: "idle" });
    setLimit(pendingCount);
  }

  const isRunning = phase.kind === "running";
  const canRun = pendingCount > 0 && !isRunning;

  return (
    <div style={{ padding: "20px 24px" }}>

      {/* EDAT date filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <label style={{ fontSize: "13px", color: "#5a6a85" }}>Fra:</label>
        <input
          type="date"
          value={edatFrom}
          disabled={isRunning}
          onChange={(e) => setEdatFrom(e.target.value)}
          style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #d1d5db", borderRadius: "6px", background: isRunning ? "#f3f4f6" : "#fff", color: "#1a1a1a" }}
        />
        <label style={{ fontSize: "13px", color: "#5a6a85" }}>Til:</label>
        <input
          type="date"
          value={edatTo}
          disabled={isRunning}
          onChange={(e) => setEdatTo(e.target.value)}
          style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #d1d5db", borderRadius: "6px", background: isRunning ? "#f3f4f6" : "#fff", color: "#1a1a1a" }}
        />
      </div>

      {/* Limit input + run button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        {showLimit && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "13px", color: "#5a6a85" }}>Antal:</label>
            <input
              type="number"
              min={1}
              max={pendingCount}
              value={limit}
              disabled={isRunning || pendingCount === 0}
              onChange={(e) => setLimit(Math.min(Math.max(1, parseInt(e.target.value) || 1), pendingCount))}
              style={{
                width: "80px",
                padding: "6px 10px",
                fontSize: "13px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                textAlign: "right",
                background: isRunning || pendingCount === 0 ? "#f3f4f6" : "#fff",
                color: "#1a1a1a",
              }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>/ {pendingCount.toLocaleString("da-DK")}</span>
          </div>
        )}

        <button
          onClick={run}
          disabled={!canRun}
          style={{
            ...btnBase,
            background: canRun ? "#E83B2A" : "#e5e7eb",
            color: canRun ? "#fff" : "#9ca3af",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          {isRunning ? "Kører..." : "Kør scoring"}
        </button>

        {phase.kind !== "idle" && (
          <button
            onClick={reset}
            style={{ ...btnBase, background: "transparent", color: "#5a6a85", border: "1px solid #d1d5db" }}
          >
            Nulstil
          </button>
        )}

        {/* Status text */}
        {phase.kind === "idle" && pendingCount === 0 && (
          <span style={{ fontSize: "13px", color: "#15803d", fontWeight: 600 }}>Ingen artikler afventer</span>
        )}
        {phase.kind === "done" && (phase.approved + phase.rejected) > 0 && (
          <span style={{ fontSize: "13px", fontWeight: 600 }}>
            <span style={{ color: "#15803d" }}>{phase.approved} inkluderet</span>
            <span style={{ color: "#5a6a85", margin: "0 6px" }}>·</span>
            <span style={{ color: "#d97706" }}>{phase.rejected} ekskluderet</span>
            {phase.failed > 0 && (
              <>
                <span style={{ color: "#5a6a85", margin: "0 6px" }}>·</span>
                <span style={{ color: "#b91c1c" }}>{phase.failed} fejlet</span>
              </>
            )}
          </span>
        )}
        {phase.kind === "done" && (phase.approved + phase.rejected) === 0 && (
          <span style={{ fontSize: "13px", fontWeight: 600 }}>
            <span style={{ color: "#15803d" }}>{phase.scored} scoret</span>
            {phase.failed > 0 && (
              <>
                <span style={{ color: "#5a6a85", margin: "0 6px" }}>·</span>
                <span style={{ color: "#b91c1c" }}>{phase.failed} fejlet</span>
              </>
            )}
          </span>
        )}
        {phase.kind === "error" && (
          <span style={{ fontSize: "13px", color: "#b91c1c" }}>Fejl: {phase.message}</span>
        )}
      </div>

      {/* Progress bar */}
      {phase.kind === "running" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <ProgressBar value={phase.scored} max={phase.total} />
          <span style={{ fontSize: "12px", color: "#5a6a85" }}>
            {phase.scored} / {phase.total > 0 ? phase.total.toLocaleString("da-DK") : "..."} scoret
          </span>
        </div>
      )}

      {/* Stale running state restored from localStorage (not started in this session) */}
      {phase.kind === "running" && !sessionActive && (
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#d97706" }}>
          En kørsel var i gang da siden blev genindlæst. Klik Nulstil og start en ny kørsel.
        </div>
      )}
    </div>
  );
}
