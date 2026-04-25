"use client";

import { useState, useRef } from "react";
import Link from "next/link";

/* ═══ Types ═══════════════════════════════════════════════════════════════════ */

interface Stats {
  totalArticles:      number;
  hasRaw:             number;
  missingRaw:         number;
  rawRows:            number;
  pendingDiffs:       number;
  resolvedDiffs:      Record<string, number>;
  pendingDiffsByField: Record<string, number>;
}

type RunPhase = "idle" | "running" | "done" | "error";

interface Progress {
  processed: number;
  total:     number;
  errors:    number;
  extra?:    Record<string, number>;
}

/* ═══ Design tokens ═══════════════════════════════════════════════════════════ */

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "24px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
  padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

/* ═══ Helpers ════════════════════════════════════════════════════════════════ */

function num(v: number) { return v.toLocaleString("da-DK"); }

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

function Spinner() {
  return (
    <svg style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "#f8f9fb", borderRadius: "8px", padding: "14px 18px", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color ?? "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? num(value) : value}
      </div>
    </div>
  );
}

function ProgressBar({ processed, total }: { processed: number; total: number }) {
  const pctVal = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#5a6a85", marginBottom: "4px" }}>
        <span>{num(processed)} / {num(total)}</span>
        <span>{pctVal}%</span>
      </div>
      <div style={{ height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pctVal}%`, background: "#E83B2A", borderRadius: "3px", transition: "width 0.2s" }} />
      </div>
    </div>
  );
}

/* ═══ Main component ══════════════════════════════════════════════════════════ */

export default function PubmedRawPage({ initialStats }: { initialStats: Stats }) {
  const [stats, setStats]       = useState<Stats>(initialStats);

  // Backfill state
  const [bPhase, setBPhase]     = useState<RunPhase>("idle");
  const [bProgress, setBProgress] = useState<Progress | null>(null);
  const [bError, setBError]     = useState<string | null>(null);
  const bReaderRef              = useRef<ReadableStreamDefaultReader | null>(null);

  // Diff state
  const [dPhase, setDPhase]     = useState<RunPhase>("idle");
  const [dProgress, setDProgress] = useState<Progress | null>(null);
  const [dError, setDError]     = useState<string | null>(null);
  const dReaderRef              = useRef<ReadableStreamDefaultReader | null>(null);

  async function refreshStats() {
    const res = await fetch("/api/admin/pubmed-raw/stats");
    const data = await res.json() as { ok: boolean } & Stats;
    if (data.ok) {
      setStats({
        totalArticles: data.totalArticles,
        hasRaw: data.hasRaw,
        missingRaw: data.missingRaw,
        rawRows: data.rawRows,
        pendingDiffs: data.pendingDiffs,
        resolvedDiffs: data.resolvedDiffs,
        pendingDiffsByField: data.pendingDiffsByField,
      });
    }
  }

  async function runSSE(
    url: string,
    method: string,
    body: object | null,
    setPhase: (p: RunPhase) => void,
    setProgress: (p: Progress | null) => void,
    setError: (e: string | null) => void,
    readerRef: React.MutableRefObject<ReadableStreamDefaultReader | null>,
    extraKey?: string,
  ) {
    setPhase("running");
    setProgress(null);
    setError(null);

    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok || !res.body) {
      setPhase("error");
      setError(`HTTP ${res.status}`);
      return;
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    readerRef.current = reader as unknown as ReadableStreamDefaultReader;

    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const msg = JSON.parse(line.slice(6)) as {
            type: string;
            processed?: number;
            total?: number;
            errors?: number;
            error?: string;
            diffsFound?: number;
          };
          if (msg.type === "start") {
            setProgress({ processed: 0, total: msg.total ?? 0, errors: 0 });
          } else if (msg.type === "progress" || msg.type === "done") {
            const extra = extraKey && msg[extraKey as keyof typeof msg] !== undefined
              ? { [extraKey]: msg[extraKey as keyof typeof msg] as number }
              : {};
            setProgress({ processed: msg.processed ?? 0, total: msg.total ?? 0, errors: msg.errors ?? 0, extra });
            if (msg.type === "done") {
              setPhase("done");
              void refreshStats();
            }
          } else if (msg.type === "error") {
            setPhase("error");
            setError(msg.error ?? "Unknown error");
          }
        } catch { /* malformed line */ }
      }
    }
  }

  function handleBackfill() {
    void runSSE(
      "/api/admin/pubmed-raw/backfill",
      "POST",
      {},
      setBPhase, setBProgress, setBError,
      bReaderRef,
    );
  }

  function handleDiff() {
    void runSSE(
      "/api/admin/pubmed-raw/diff",
      "POST",
      null,
      setDPhase, setDProgress, setDError,
      dReaderRef,
      "diffsFound",
    );
  }

  const rawPct = pct(stats.hasRaw, stats.totalArticles);
  const pendingDiffTotal = Object.values(stats.pendingDiffsByField).reduce((s, v) => s + v, 0);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/import" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Import oversigt
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Import
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Raw XML Lager</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Gem rå PubMed XML per artikel — bruges til audit, diff-detektion og re-parsing
          </p>
        </div>

        {/* ═══ STATUS-OVERSIGT ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Status</span>
            <button
              onClick={() => void refreshStats()}
              style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Opdater
            </button>
          </div>
          <div style={{ padding: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <KpiBox label="Total artikler" value={stats.totalArticles} />
            <KpiBox label="Har raw XML" value={`${num(stats.hasRaw)} (${rawPct})`} color={stats.hasRaw === stats.totalArticles ? "#15803d" : "#1a1a1a"} />
            <KpiBox label="Mangler raw" value={stats.missingRaw} color={stats.missingRaw > 0 ? "#d97706" : "#15803d"} />
            <KpiBox label="Raw rækker i DB" value={stats.rawRows} />
          </div>
        </div>

        {/* ═══ SEKTION A: BACKFILL ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Backfill raw XML</span>
            <button
              onClick={handleBackfill}
              disabled={bPhase === "running" || dPhase === "running"}
              style={{
                padding: "6px 16px", fontSize: "12px", fontWeight: 700,
                background: bPhase === "running" ? "#9ca3af" : "#E83B2A",
                color: "#fff", border: "none", borderRadius: "6px",
                cursor: bPhase === "running" ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {bPhase === "running" && <Spinner />}
              {bPhase === "running" ? "Henter XML…" : "Backfill manglende raw XML"}
            </button>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", color: "#5a6a85", margin: "0 0 16px", lineHeight: 1.6 }}>
              Henter rå PubMed XML for alle artikler der endnu ikke har et raw-lager.
              Kører nyeste artikler først. Skriver til <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>article_pubmed_raw</code> og
              opdaterer <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>articles.pubmed_raw_latest_at</code>.
            </p>

            {bPhase === "idle" && stats.missingRaw === 0 && (
              <div style={{ fontSize: "13px", color: "#15803d", fontWeight: 600 }}>
                Alle artikler har raw XML.
              </div>
            )}

            {bPhase !== "idle" && bProgress && (
              <div style={{ marginBottom: 12 }}>
                <ProgressBar processed={bProgress.processed} total={bProgress.total} />
                {bProgress.errors > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>
                    {num(bProgress.errors)} fejl
                  </div>
                )}
              </div>
            )}

            {bPhase === "done" && bProgress && (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                Færdig — {num(bProgress.processed)} artikler behandlet, {num(bProgress.errors)} fejl
              </div>
            )}

            {bPhase === "error" && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c" }}>
                Fejl: {bError}
              </div>
            )}
          </div>
        </div>

        {/* ═══ SEKTION B: DIFF ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Diff-detektion</span>
            <button
              onClick={handleDiff}
              disabled={dPhase === "running" || bPhase === "running"}
              style={{
                padding: "6px 16px", fontSize: "12px", fontWeight: 700,
                background: dPhase === "running" ? "#9ca3af" : "#1a1a1a",
                color: "#fff", border: "none", borderRadius: "6px",
                cursor: dPhase === "running" ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {dPhase === "running" && <Spinner />}
              {dPhase === "running" ? "Sammenligner…" : "Kør diff-detektion"}
            </button>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", color: "#5a6a85", margin: "0 0 16px", lineHeight: 1.6 }}>
              Re-parser rå XML og sammenligner <strong>title</strong> og <strong>abstract</strong> med nuværende værdier i
              databasen. Afvigelser logges i <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>article_pubmed_diffs</code> med <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>resolution = pending</code>.
              Idempotent — eksisterende pending diffs overskrives ikke.
            </p>

            {/* Diff stats */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ background: "#f8f9fb", borderRadius: 8, padding: "12px 16px", minWidth: 110 }}>
                <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 2 }}>Pending diffs</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: stats.pendingDiffs > 0 ? "#d97706" : "#1a1a1a" }}>{num(stats.pendingDiffs)}</div>
              </div>
              {Object.entries(stats.pendingDiffsByField).map(([field, count]) => (
                <div key={field} style={{ background: "#f8f9fb", borderRadius: 8, padding: "12px 16px", minWidth: 110 }}>
                  <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 2 }}>{field}</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#d97706" }}>{num(count)}</div>
                </div>
              ))}
              {Object.entries(stats.resolvedDiffs).map(([res, count]) => (
                <div key={res} style={{ background: "#f8f9fb", borderRadius: 8, padding: "12px 16px", minWidth: 110 }}>
                  <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 2 }}>{res}</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#15803d" }}>{num(count)}</div>
                </div>
              ))}
              {stats.pendingDiffs === 0 && pendingDiffTotal === 0 && Object.keys(stats.resolvedDiffs).length === 0 && (
                <div style={{ fontSize: 13, color: "#888", alignSelf: "center" }}>Ingen diffs registreret endnu</div>
              )}
            </div>

            {dPhase !== "idle" && dProgress && (
              <div style={{ marginBottom: 12 }}>
                <ProgressBar processed={dProgress.processed} total={dProgress.total} />
                {dProgress.extra?.diffsFound !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#5a6a85" }}>
                    {num(dProgress.extra.diffsFound)} nye diffs fundet
                  </div>
                )}
                {dProgress.errors > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#dc2626" }}>
                    {num(dProgress.errors)} parse-fejl
                  </div>
                )}
              </div>
            )}

            {dPhase === "done" && dProgress && (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                Færdig — {num(dProgress.processed)} artikler gennemgået,{" "}
                {num(dProgress.extra?.diffsFound ?? 0)} nye diffs registreret
              </div>
            )}

            {dPhase === "error" && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c" }}>
                Fejl: {dError}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
