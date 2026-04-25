"use client";

import { useState, useRef } from "react";
import Link from "next/link";

/* ═══ Types ═══════════════════════════════════════════════════════════════════ */

interface Stats {
  totalArticles:          number;
  hasRaw:                 number;
  missingRaw:             number;
  rawRows:                number;
  pendingDiffs:           number;
  resolvedDiffs:          Record<string, number>;
  pendingDiffsByField:    Record<string, number>;
  pendingDiffsByCategory: Record<string, number>;
  nullCategoryCount:      number;
}

type RunPhase = "idle" | "running" | "done" | "error";

interface Progress {
  processed: number;
  total:     number;
  errors:    number;
  extra?:    Record<string, number>;
}

/* ═══ Category config ════════════════════════════════════════════════════════ */

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  data_loss:         { label: "Data loss",          color: "#dc2626", bg: "#fef2f2" },
  content_differs:   { label: "Content differs",    color: "#d97706", bg: "#fffbeb" },
  casing_only:       { label: "Casing only",        color: "#6b7280", bg: "#f9fafb" },
  unicode_variant:   { label: "Unicode variant",    color: "#6b7280", bg: "#f9fafb" },
  db_shorter_labels: { label: "DB shorter (labels)", color: "#6b7280", bg: "#f9fafb" },
  __null__:          { label: "Uncategorized",      color: "#9ca3af", bg: "#f3f4f6" },
};

const CATEGORY_ORDER = ["data_loss", "content_differs", "casing_only", "unicode_variant", "db_shorter_labels", "__null__"];

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

function num(v: number) { return v.toLocaleString("en-US"); }

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

function LimitInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a85", whiteSpace: "nowrap" }}>
        Limit (articles)
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="all"
        style={{
          width: "90px", border: "1px solid #d1d5db", borderRadius: "6px",
          padding: "5px 9px", fontSize: "13px", color: "#1a1a1a", outline: "none",
          background: disabled ? "#f3f4f6" : "#fff",
        }}
      />
    </div>
  );
}

/* ═══ Main component ══════════════════════════════════════════════════════════ */

export default function PubmedRawPage({ initialStats }: { initialStats: Stats }) {
  const [stats, setStats] = useState<Stats>(initialStats);

  // Backfill state
  const [bPhase, setBPhase]       = useState<RunPhase>("idle");
  const [bProgress, setBProgress] = useState<Progress | null>(null);
  const [bError, setBError]       = useState<string | null>(null);
  const [bLimit, setBLimit]       = useState("");
  const bReaderRef                = useRef<ReadableStreamDefaultReader | null>(null);

  // Diff state
  const [dPhase, setDPhase]       = useState<RunPhase>("idle");
  const [dProgress, setDProgress] = useState<Progress | null>(null);
  const [dError, setDError]       = useState<string | null>(null);
  const [dLimit, setDLimit]       = useState("");
  const dReaderRef                = useRef<ReadableStreamDefaultReader | null>(null);

  // Backfill-categories state
  const [catPhase, setCatPhase]   = useState<RunPhase>("idle");
  const [catUpdated, setCatUpdated] = useState<number | null>(null);
  const [catError, setCatError]   = useState<string | null>(null);

  async function refreshStats() {
    const res = await fetch("/api/admin/pubmed-raw/stats");
    const data = await res.json() as { ok: boolean } & Stats;
    if (data.ok) setStats(data);
  }

  async function runSSE(
    url: string,
    body: object,
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      setPhase("error");
      setError(`HTTP ${res.status}`);
      return;
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    readerRef.current = reader as unknown as ReadableStreamDefaultReader;

    let buffer = "";
    try {
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
    } catch {
      setPhase("idle");
    } finally {
      readerRef.current = null;
    }
  }

  function stopJob(
    readerRef: React.MutableRefObject<ReadableStreamDefaultReader | null>,
    setPhase: (p: RunPhase) => void,
  ) {
    readerRef.current?.cancel();
    readerRef.current = null;
    setPhase("idle");
  }

  async function handleBackfillCategories() {
    setCatPhase("running");
    setCatUpdated(null);
    setCatError(null);
    try {
      const res = await fetch("/api/admin/pubmed-raw/backfill-categories", { method: "POST" });
      const data = await res.json() as { ok: boolean; updated?: number; error?: string };
      if (data.ok) {
        setCatPhase("done");
        setCatUpdated(data.updated ?? 0);
        void refreshStats();
      } else {
        setCatPhase("error");
        setCatError(data.error ?? "Unknown error");
      }
    } catch (e) {
      setCatPhase("error");
      setCatError(String(e));
    }
  }

  function handleBackfill() {
    const limitVal = bLimit.trim() ? parseInt(bLimit, 10) : undefined;
    void runSSE(
      "/api/admin/pubmed-raw/backfill",
      limitVal ? { limit: limitVal } : {},
      setBPhase, setBProgress, setBError,
      bReaderRef,
    );
  }

  function handleDiff() {
    const limitVal = dLimit.trim() ? parseInt(dLimit, 10) : undefined;
    void runSSE(
      "/api/admin/pubmed-raw/diff",
      limitVal ? { limit: limitVal } : {},
      setDPhase, setDProgress, setDError,
      dReaderRef,
      "diffsFound",
    );
  }

  const rawPct = pct(stats.hasRaw, stats.totalArticles);
  const hasCategoryData = Object.keys(stats.pendingDiffsByCategory).length > 0;
  const anyDiffs = stats.pendingDiffs > 0 || Object.keys(stats.resolvedDiffs).length > 0;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/import" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Import overview
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Import
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Raw XML Storage</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Store raw PubMed XML per article — used for audit, diff detection, and re-parsing
          </p>
        </div>

        {/* ═══ STATUS ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Status</span>
            <button
              onClick={() => void refreshStats()}
              style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Refresh
            </button>
          </div>
          <div style={{ padding: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <KpiBox label="Total articles" value={stats.totalArticles} />
            <KpiBox label="Has raw XML" value={`${num(stats.hasRaw)} (${rawPct})`} color={stats.hasRaw === stats.totalArticles ? "#15803d" : "#1a1a1a"} />
            <KpiBox label="Missing raw" value={stats.missingRaw} color={stats.missingRaw > 0 ? "#d97706" : "#15803d"} />
            <KpiBox label="Raw rows in DB" value={stats.rawRows} />
          </div>
        </div>

        {/* ═══ SECTION A: BACKFILL ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Backfill raw XML</span>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", color: "#5a6a85", margin: "0 0 16px", lineHeight: 1.6 }}>
              Fetches raw PubMed XML for all articles that don&apos;t yet have a raw record.
              Newest articles first. Writes to{" "}
              <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>article_pubmed_raw</code>{" "}
              and updates{" "}
              <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>articles.pubmed_raw_latest_at</code>.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
              <LimitInput value={bLimit} onChange={setBLimit} disabled={bPhase === "running"} />
              {bPhase === "running" ? (
                <button
                  onClick={() => stopJob(bReaderRef, setBPhase)}
                  style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Spinner /> Stop
                </button>
              ) : (
                <button
                  onClick={handleBackfill}
                  disabled={dPhase === "running"}
                  style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, background: dPhase === "running" ? "#9ca3af" : "#E83B2A", color: "#fff", border: "none", borderRadius: "6px", cursor: dPhase === "running" ? "default" : "pointer" }}
                >
                  Backfill missing raw XML
                </button>
              )}
            </div>

            {bPhase === "idle" && stats.missingRaw === 0 && (
              <div style={{ fontSize: "13px", color: "#15803d", fontWeight: 600 }}>All articles have raw XML.</div>
            )}
            {bPhase !== "idle" && bProgress && (
              <div style={{ marginBottom: 12 }}>
                <ProgressBar processed={bProgress.processed} total={bProgress.total} />
                {bProgress.errors > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{num(bProgress.errors)} errors</div>}
              </div>
            )}
            {bPhase === "done" && bProgress && (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                Done — {num(bProgress.processed)} articles processed, {num(bProgress.errors)} errors
              </div>
            )}
            {bPhase === "error" && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c" }}>
                Error: {bError}
              </div>
            )}
          </div>
        </div>

        {/* ═══ SECTION B: DIFF DETECTION ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Diff detection</span>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", color: "#5a6a85", margin: "0 0 16px", lineHeight: 1.6 }}>
              Re-parses raw XML and compares <strong>title</strong> and <strong>abstract</strong> with current values
              in the database. Differences are logged to{" "}
              <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>article_pubmed_diffs</code>{" "}
              with{" "}
              <code style={{ fontSize: 12, background: "#f1f3f7", padding: "1px 5px", borderRadius: 4 }}>resolution = pending</code>.
              Idempotent — existing pending diffs are not overwritten.
            </p>

            {/* Category breakdown */}
            {anyDiffs && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: 10 }}>
                  Pending diffs — {num(stats.pendingDiffs)} total
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {CATEGORY_ORDER
                    .filter((cat) => (stats.pendingDiffsByCategory[cat] ?? 0) > 0)
                    .map((cat) => {
                      const meta = CATEGORY_META[cat] ?? { label: cat, color: "#6b7280", bg: "#f9fafb" };
                      const count = stats.pendingDiffsByCategory[cat] ?? 0;
                      return (
                        <div key={cat} style={{ background: meta.bg, border: `1px solid ${meta.color}22`, borderRadius: 8, padding: "10px 14px", minWidth: 110 }}>
                          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: meta.color, marginBottom: 2 }}>
                            {meta.label}
                          </div>
                          <div style={{ fontSize: "20px", fontWeight: 700, color: meta.color, fontVariantNumeric: "tabular-nums" }}>
                            {num(count)}
                          </div>
                        </div>
                      );
                    })}
                  {!hasCategoryData && stats.pendingDiffs > 0 && (
                    <div style={{ fontSize: 13, color: "#6b7280", alignSelf: "center" }}>
                      No categories yet —{" "}
                      <button
                        onClick={() => void handleBackfillCategories()}
                        disabled={catPhase === "running"}
                        style={{ fontSize: 13, color: "#E83B2A", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
                      >
                        backfill categories
                      </button>
                    </div>
                  )}
                </div>

                {/* Resolved diffs summary */}
                {Object.keys(stats.resolvedDiffs).length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: 8 }}>
                    {Object.entries(stats.resolvedDiffs).map(([res, count]) => (
                      <div key={res} style={{ background: "#f0fdf4", border: "1px solid #bbf7d022", borderRadius: 8, padding: "10px 14px", minWidth: 90 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#15803d", marginBottom: 2 }}>{res}</div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#15803d" }}>{num(count)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Backfill categories button — shown when some rows lack a category */}
                {stats.nullCategoryCount > 0 && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      {num(stats.nullCategoryCount)} pending diffs without a category
                    </span>
                    {catPhase !== "running" ? (
                      <button
                        onClick={() => void handleBackfillCategories()}
                        style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85", background: "#f1f3f7", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
                      >
                        Backfill categories
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "#5a6a85", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Spinner /> Backfilling…
                      </span>
                    )}
                    {catPhase === "done" && catUpdated !== null && (
                      <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>
                        {num(catUpdated)} rows updated
                      </span>
                    )}
                    {catPhase === "error" && (
                      <span style={{ fontSize: 12, color: "#dc2626" }}>{catError}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!anyDiffs && (
              <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>No diffs recorded yet</div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
              <LimitInput value={dLimit} onChange={setDLimit} disabled={dPhase === "running"} />
              {dPhase === "running" ? (
                <button
                  onClick={() => stopJob(dReaderRef, setDPhase)}
                  style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Spinner /> Stop
                </button>
              ) : (
                <button
                  onClick={handleDiff}
                  disabled={bPhase === "running"}
                  style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, background: bPhase === "running" ? "#9ca3af" : "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: bPhase === "running" ? "default" : "pointer" }}
                >
                  Run diff detection
                </button>
              )}
            </div>

            {dPhase !== "idle" && dProgress && (
              <div style={{ marginBottom: 12 }}>
                <ProgressBar processed={dProgress.processed} total={dProgress.total} />
                {dProgress.extra?.diffsFound !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#5a6a85" }}>
                    {num(dProgress.extra.diffsFound)} new diffs found
                  </div>
                )}
                {dProgress.errors > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#dc2626" }}>{num(dProgress.errors)} parse errors</div>
                )}
              </div>
            )}
            {dPhase === "done" && dProgress && (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                Done — {num(dProgress.processed)} articles checked,{" "}
                {num(dProgress.extra?.diffsFound ?? 0)} new diffs recorded
              </div>
            )}
            {dPhase === "error" && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c" }}>
                Error: {dError}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
