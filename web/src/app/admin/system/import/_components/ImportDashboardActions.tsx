"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Props {
  specialtySlugs: string[];
  subset: "articles" | "linking" | "citations" | "impact-factor" | "author-score" | "cleanup" | "geo";
}

type ActionState = "idle" | "loading" | "done" | "error";

interface CitStats {
  withCitations:    number;
  withoutCitations: number;
  total:            number;
  pct:              number;
  latestFetchedAt:  string | null;
}

interface IFStats {
  hasIF:           number;
  noData:          number;
  noIssn:          number;
  pending:         number;
  total:           number;
  pct:             number;
  latestFetchedAt: string | null;
}

interface GeoStats {
  parsed:          number;
  high_confidence: number;
  low_confidence:  number;
  unparsed:        number;
  ai_attempted:    number;
  ai_upgraded:     number;
  ai_conflicted:   number;
  ai_remaining:    number;
  total:           number;
  pct:             number;
}

function n(v: number | undefined | null) { return (v ?? 0).toLocaleString("da-DK"); }

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ProgressUI({ pct, left, right, running, footer, onTrigger, btnLabel }: {
  pct:       number;
  left:      string;
  right:     string;
  running:   boolean;
  footer:    string;
  onTrigger: () => void;
  btnLabel:  string;
}) {
  const barColor = pct >= 80 ? "#15803d" : pct >= 40 ? "#d97706" : "#E83B2A";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "12px", color: "#5a6a85", fontWeight: 600 }}>{left}</span>
          <span style={{ fontSize: "12px", fontWeight: 700, color: barColor }}>{pct}%</span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: "3px", transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
          <span style={{ fontSize: "11px", color: "#aaa" }}>{running ? "Henter…" : footer}</span>
          <span style={{ fontSize: "11px", color: "#aaa" }}>{right}</span>
        </div>
      </div>
      <div>
        <button
          onClick={onTrigger}
          disabled={running}
          style={{
            padding: "8px 16px", borderRadius: "7px", border: "none",
            fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
            cursor: running ? "not-allowed" : "pointer",
            background: running ? "#f1f3f7" : "#E83B2A",
            color:      running ? "#9ca3af"  : "#fff",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {running ? "Henter…" : btnLabel}
        </button>
      </div>
    </div>
  );
}

export default function ImportDashboardActions({ specialtySlugs, subset }: Props) {
  const [c1State,        setC1State]        = useState<ActionState>("idle");
  const [c2State,        setC2State]        = useState<ActionState>("idle");
  const [linkState,      setLinkState]      = useState<ActionState>("idle");
  const [authorScState,  setAuthorScState]  = useState<ActionState>("idle");
  const [cleanupState,   setCleanupState]   = useState<ActionState>("idle");
  const [cleanupMsg,     setCleanupMsg]     = useState<string | null>(null);

  // ── Citations state ──────────────────────────────────────────────────────────
  const [citState,  setCitState]  = useState<ActionState>("idle");
  const [citStats,  setCitStats]  = useState<CitStats | null>(null);
  const citPollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const citStableCount   = useRef(0);
  const citLastWithCount = useRef<number | null>(null);

  // ── Impact Factor state ──────────────────────────────────────────────────────
  const [ifState,  setIfState]  = useState<ActionState>("idle");
  const [ifStats,  setIfStats]  = useState<IFStats | null>(null);
  const ifPollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const ifStableCount   = useRef(0);
  const ifLastWithCount = useRef<number | null>(null);

  // ── Geo-location state ──────────────────────────────────────────────────────
  const [geoStats,  setGeoStats]  = useState<GeoStats | null>(null);

  // ── Backfill states state ─────────────────────────────────────────────────
  const [backfillStatesState, setBackfillStatesState] = useState<ActionState>("idle");
  const [backfillStatesMsg, setBackfillStatesMsg] = useState<string | null>(null);

  // ── Re-parse authors state ──────────────────────────────────────────────
  const [reparseAuthorsState, setReparseAuthorsState] = useState<ActionState>("idle");

  // ── Resolve states state ──────────────────────────────────────────────
  const [resolveStatesState, setResolveStatesState] = useState<ActionState>("idle");
  const [resolveStatesMsg, setResolveStatesMsg] = useState<string | null>(null);

  // ── AI parse authors state ──────────────────────────────────────────
  const [aiParseAuthorsState, setAiParseAuthorsState] = useState<ActionState>("idle");
  const [aiParseAuthorsMsg, setAiParseAuthorsMsg] = useState<string | null>(null);

  // ── Citations helpers ────────────────────────────────────────────────────────

  const fetchCitStats = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/citations/status");
      const data = (await res.json()) as CitStats;
      setCitStats(data);
      return data;
    } catch { return null; }
  }, []);

  function stopCitPolling() {
    if (citPollRef.current) { clearInterval(citPollRef.current); citPollRef.current = null; }
    citStableCount.current   = 0;
    citLastWithCount.current = null;
  }

  function startCitPolling() {
    stopCitPolling();
    citPollRef.current = setInterval(async () => {
      const data = await fetchCitStats();
      if (!data) return;
      if (data.withCitations === citLastWithCount.current) {
        citStableCount.current++;
        if (citStableCount.current >= 3) { stopCitPolling(); setCitState("done"); }
      } else {
        citStableCount.current   = 0;
        citLastWithCount.current = data.withCitations;
      }
    }, 3000);
  }

  // ── Impact Factor helpers ────────────────────────────────────────────────────

  const fetchIFStats = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/impact-factor/status");
      const data = (await res.json()) as IFStats;
      setIfStats(data);
      return data;
    } catch { return null; }
  }, []);

  function stopIFPolling() {
    if (ifPollRef.current) { clearInterval(ifPollRef.current); ifPollRef.current = null; }
    ifStableCount.current   = 0;
    ifLastWithCount.current = null;
  }

  function startIFPolling() {
    stopIFPolling();
    ifPollRef.current = setInterval(async () => {
      const data = await fetchIFStats();
      if (!data) return;
      if (data.hasIF === ifLastWithCount.current) {
        ifStableCount.current++;
        if (ifStableCount.current >= 3) { stopIFPolling(); setIfState("done"); }
      } else {
        ifStableCount.current   = 0;
        ifLastWithCount.current = data.hasIF;
      }
    }, 3000);
  }

  // ── Geo helpers ─────────────────────────────────────────────────────────────

  const fetchGeoStats = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/geo/status");
      const data = (await res.json()) as GeoStats;
      setGeoStats(data);
      return data;
    } catch { return null; }
  }, []);

  // ── Mount effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (subset === "citations")     { void fetchCitStats(); }
    if (subset === "impact-factor") { void fetchIFStats(); }
    if (subset === "geo")           { void fetchGeoStats(); }
    return () => { stopCitPolling(); stopIFPolling(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subset]);

  // ── Triggers ────────────────────────────────────────────────────────────────

  async function triggerC1() {
    setC1State("loading");
    try {
      const res  = await fetch("/api/admin/pubmed/trigger-import", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setC1State(json.ok ? "done" : "error");
    } catch { setC1State("error"); }
  }

  async function triggerC2() {
    setC2State("loading");
    try {
      for (const slug of specialtySlugs) {
        await fetch(`/api/admin/pubmed/trigger-import-circle2?specialty=${slug}`, { method: "POST" });
      }
      setC2State("done");
    } catch { setC2State("error"); }
  }

  async function triggerLinking() {
    setLinkState("loading");
    try {
      const res  = await fetch("/api/admin/author-linking/start", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setLinkState(json.ok ? "done" : "error");
    } catch { setLinkState("error"); }
  }

  async function triggerCitations() {
    setCitState("loading");
    try {
      const res  = await fetch("/api/admin/citations/fetch", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) { setCitState("error"); return; }
      const current = await fetchCitStats();
      citLastWithCount.current = current?.withCitations ?? null;
      startCitPolling();
    } catch { setCitState("error"); }
  }

  async function triggerAuthorScore() {
    setAuthorScState("loading");
    try {
      const res  = await fetch("/api/admin/authors/compute-score", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setAuthorScState(json.ok ? "done" : "error");
    } catch { setAuthorScState("error"); }
  }

  async function triggerIF() {
    setIfState("loading");
    try {
      const res  = await fetch("/api/admin/impact-factor/fetch", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) { setIfState("error"); return; }
      const current = await fetchIFStats();
      ifLastWithCount.current = current?.hasIF ?? null;
      startIFPolling();
    } catch { setIfState("error"); }
  }

  async function triggerBackfillStates() {
    setBackfillStatesState("loading");
    setBackfillStatesMsg(null);
    try {
      const res = await fetch("/api/admin/geo/backfill-states", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setBackfillStatesState("error");
        setBackfillStatesMsg(data.error ?? "Noget gik galt");
        return;
      }
      setBackfillStatesMsg(`${n(data.updated)} opdateret, ${n(data.skipped)} sprunget over`);
      setBackfillStatesState("done");
    } catch {
      setBackfillStatesState("error");
      setBackfillStatesMsg("Netværksfejl — prøv igen");
    }
  }

  async function triggerReparseAuthors() {
    setReparseAuthorsState("loading");
    try {
      const res = await fetch("/api/admin/geo/reparse-authors", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setReparseAuthorsState(json.ok ? "done" : "error");
    } catch { setReparseAuthorsState("error"); }
  }

  async function triggerResolveStates() {
    setResolveStatesState("loading");
    setResolveStatesMsg(null);
    try {
      const res = await fetch("/api/admin/geo/resolve-states", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; pairsToLookup?: number };
      if (json.ok) {
        setResolveStatesState("done");
        setResolveStatesMsg(`${json.pairsToLookup ?? 0} par sendt til Nominatim`);
      } else {
        setResolveStatesState("error");
        setResolveStatesMsg("Fejl ved start");
      }
    } catch {
      setResolveStatesState("error");
      setResolveStatesMsg("Netværksfejl");
    }
  }

  async function triggerAiParseAuthors() {
    setAiParseAuthorsState("loading");
    setAiParseAuthorsMsg(null);
    try {
      const res = await fetch("/api/admin/geo/ai-parse-authors", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; queued?: number };
      if (json.ok) {
        setAiParseAuthorsState("done");
        setAiParseAuthorsMsg(`${json.queued ?? 0} forfattere sendt til AI-parse`);
      } else {
        setAiParseAuthorsState("error");
        setAiParseAuthorsMsg("Fejl ved start");
      }
    } catch {
      setAiParseAuthorsState("error");
      setAiParseAuthorsMsg("Netværksfejl");
    }
  }

  async function triggerCleanup() {
    setCleanupState("loading");
    setCleanupMsg(null);
    try {
      const res  = await fetch("/api/admin/cleanup-stuck-jobs", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCleanupState("error");
        setCleanupMsg(data.error ?? "Noget gik galt");
        return;
      }
      const total = (data.import_logs_fixed ?? 0) + (data.author_linking_logs_fixed ?? 0);
      if (total === 0) {
        setCleanupMsg("Ingen hængte jobs fundet");
      } else {
        const parts: string[] = [];
        if (data.import_logs_fixed > 0)        parts.push(`${data.import_logs_fixed} import`);
        if (data.author_linking_logs_fixed > 0) parts.push(`${data.author_linking_logs_fixed} author linking`);
        setCleanupMsg(`Ryddede op i ${parts.join(" + ")} job${total > 1 ? "s" : ""}`);
      }
      setCleanupState("done");
    } catch {
      setCleanupState("error");
      setCleanupMsg("Netværksfejl — prøv igen");
    }
  }

  // ── Geo subset UI ──────────────────────────────────────────────────────────

  if (subset === "geo") {
    const s = geoStats;
    const pct = s?.pct ?? 0;
    const barColor = pct >= 80 ? "#15803d" : pct >= 40 ? "#d97706" : "#E83B2A";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Overall progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", color: "#5a6a85", fontWeight: 600 }}>
              {s ? `${n(s.parsed)} / ${n(s.total)} artikler med geo-data` : "—"}
            </span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: barColor }}>{pct}%</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: "3px", transition: "width 0.6s ease" }} />
          </div>
        </div>

        {/* Two-section breakdown */}
        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Deterministisk parser */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Deterministisk parser
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <Link href="/admin/system/geo/articles?filter=high_confidence" style={{ textDecoration: "none", background: "#f0fdf4", borderRadius: "6px", padding: "8px 10px", border: "1px solid #bbf7d0", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803d" }}>{n(s.high_confidence)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>High conf.</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=low_confidence" style={{ textDecoration: "none", background: "#fff7ed", borderRadius: "6px", padding: "8px 10px", border: "1px solid #fed7aa", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#c2410c" }}>{n(s.low_confidence)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Low conf.</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=unparsed" style={{ textDecoration: "none", background: "#f9fafb", borderRadius: "6px", padding: "8px 10px", border: "1px solid #d1d5db", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#374151" }}>{n(s.unparsed)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Ikke parset</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=parsed" style={{ textDecoration: "none", background: "#eff6ff", borderRadius: "6px", padding: "8px 10px", border: "1px solid #bfdbfe", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#1d4ed8" }}>{n(s.parsed)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Parset</div>
                </Link>
              </div>
            </div>

            {/* AI fallback */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                AI fallback
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <Link href="/admin/system/geo/articles?filter=ai_attempted" style={{ textDecoration: "none", background: "#f5f3ff", borderRadius: "6px", padding: "8px 10px", border: "1px solid #ddd6fe", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#6d28d9" }}>{n(s.ai_attempted)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Forsøgt</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=ai_upgraded" style={{ textDecoration: "none", background: "#f0fdf4", borderRadius: "6px", padding: "8px 10px", border: "1px solid #bbf7d0", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803d" }}>{n(s.ai_upgraded)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Opgraderet</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=ai_conflicted" style={{ textDecoration: "none", background: "#fff7ed", borderRadius: "6px", padding: "8px 10px", border: "1px solid #fed7aa", transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#c2410c" }}>{n(s.ai_conflicted)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Konflikter</div>
                </Link>
                <Link href="/admin/system/geo/articles?filter=ai_remaining" style={{ textDecoration: "none", background: s.ai_remaining > 0 ? "#fef2f2" : "#f9fafb", borderRadius: "6px", padding: "8px 10px", border: `1px solid ${s.ai_remaining > 0 ? "#fecaca" : "#d1d5db"}`, transition: "opacity 0.15s" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: s.ai_remaining > 0 ? "#b91c1c" : "#374151" }}>{n(s.ai_remaining)}</div>
                  <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Afventer AI</div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {(() => {
            const bfRunning = backfillStatesState === "loading";
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => { void triggerBackfillStates(); }}
                  disabled={bfRunning}
                  style={{
                    padding: "8px 16px", borderRadius: "7px", border: "none",
                    fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                    cursor: bfRunning ? "not-allowed" : "pointer",
                    background: bfRunning ? "#f1f3f7" : backfillStatesState === "done" ? "#f0fdf4" : "#6d28d9",
                    color:      bfRunning ? "#9ca3af" : backfillStatesState === "done" ? "#15803d" : "#fff",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {bfRunning ? "Kører backfill…" : backfillStatesState === "done" ? "Backfill færdig ✓" : "Backfill states"}
                </button>
                {backfillStatesMsg && (
                  <span style={{ fontSize: "11px", color: backfillStatesState === "error" ? "#b91c1c" : "#15803d" }}>
                    {backfillStatesMsg}
                  </span>
                )}
              </span>
            );
          })()}
          {(() => {
            const raRunning = reparseAuthorsState === "loading";
            return (
              <button
                onClick={() => { void triggerReparseAuthors(); }}
                disabled={raRunning}
                style={{
                  padding: "8px 16px", borderRadius: "7px", border: "none",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: raRunning ? "not-allowed" : "pointer",
                  background: raRunning ? "#f1f3f7" : reparseAuthorsState === "done" ? "#f0fdf4" : "#7c3aed",
                  color:      raRunning ? "#9ca3af" : reparseAuthorsState === "done" ? "#15803d" : "#fff",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {raRunning ? "Re-parsing authors…" : reparseAuthorsState === "done" ? "Authors re-parsed ✓" : "Re-parse authors"}
              </button>
            );
          })()}
          {(() => {
            const rsRunning = resolveStatesState === "loading";
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => { void triggerResolveStates(); }}
                  disabled={rsRunning}
                  style={{
                    padding: "8px 16px", borderRadius: "7px", border: "none",
                    fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                    cursor: rsRunning ? "not-allowed" : "pointer",
                    background: rsRunning ? "#f1f3f7" : resolveStatesState === "done" ? "#f0fdf4" : "#15803d",
                    color:      rsRunning ? "#9ca3af" : resolveStatesState === "done" ? "#15803d" : "#fff",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {rsRunning ? "Resolving states…" : resolveStatesState === "done" ? "States resolved ✓" : "Resolve states (Nominatim)"}
                </button>
                {resolveStatesMsg && (
                  <span style={{ fontSize: "11px", color: resolveStatesState === "error" ? "#b91c1c" : "#15803d" }}>
                    {resolveStatesMsg}
                  </span>
                )}
              </span>
            );
          })()}
          {(() => {
            const apRunning = aiParseAuthorsState === "loading";
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => { void triggerAiParseAuthors(); }}
                  disabled={apRunning}
                  style={{
                    padding: "8px 16px", borderRadius: "7px", border: "none",
                    fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                    cursor: apRunning ? "not-allowed" : "pointer",
                    background: apRunning ? "#f1f3f7" : aiParseAuthorsState === "done" ? "#f0fdf4" : "#2563eb",
                    color:      apRunning ? "#9ca3af" : aiParseAuthorsState === "done" ? "#15803d" : "#fff",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {apRunning ? "AI-parsing authors…" : aiParseAuthorsState === "done" ? "AI-parse done ✓" : "AI-parse authors"}
                </button>
                {aiParseAuthorsMsg && (
                  <span style={{ fontSize: "11px", color: aiParseAuthorsState === "error" ? "#b91c1c" : "#15803d" }}>
                    {aiParseAuthorsMsg}
                  </span>
                )}
              </span>
            );
          })()}
        </div>
      </div>
    );
  }

  // ── Cleanup subset UI ──────────────────────────────────────────────────────

  if (subset === "cleanup") {
    const bg    = cleanupState === "done"    ? "#f0fdf4"
                : cleanupState === "error"   ? "#fef2f2"
                : cleanupState === "loading" ? "#f1f3f7"
                :                              "#E83B2A";
    const color = cleanupState === "done"    ? "#15803d"
                : cleanupState === "error"   ? "#b91c1c"
                : cleanupState === "loading" ? "#9ca3af"
                :                              "#fff";
    const label = cleanupState === "loading" ? "Rydder op…"
                : cleanupState === "done"    ? "Færdig ✓"
                : cleanupState === "error"   ? "Fejl — prøv igen"
                :                              "Ryd op i hængte jobs";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={() => { void triggerCleanup(); }}
          disabled={cleanupState === "loading"}
          style={{
            padding: "8px 16px", borderRadius: "7px", border: "none",
            fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
            cursor: cleanupState === "loading" ? "not-allowed" : "pointer",
            background: bg, color,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {label}
        </button>
        {cleanupMsg && (
          <span style={{
            fontSize: "12px", color: cleanupState === "error" ? "#b91c1c" : "#15803d",
          }}>
            {cleanupMsg}
          </span>
        )}
      </div>
    );
  }

  // ── Citations subset UI ──────────────────────────────────────────────────────

  if (subset === "citations") {
    return (
      <ProgressUI
        pct={citStats?.pct ?? 0}
        left={citStats ? `${n(citStats.withCitations)} / ${n(citStats.total)} artikler` : "—"}
        right={citStats ? `${n(citStats.withoutCitations)} mangler` : ""}
        running={citState === "loading"}
        footer={`Sidst hentet: ${fmt(citStats?.latestFetchedAt ?? null)}`}
        onTrigger={() => { void triggerCitations(); }}
        btnLabel="Hent citations nu"
      />
    );
  }

  // ── Impact Factor subset UI ──────────────────────────────────────────────────

  if (subset === "impact-factor") {
    const s = ifStats;
    const barColor = (s?.pct ?? 0) >= 80 ? "#15803d" : (s?.pct ?? 0) >= 40 ? "#d97706" : "#E83B2A";
    const running  = ifState === "loading";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", color: "#5a6a85", fontWeight: 600 }}>
              {s ? `${n(s.hasIF)} / ${n(s.total)} artikler` : "—"}
            </span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: barColor }}>{s?.pct ?? 0}%</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s?.pct ?? 0}%`, background: barColor, borderRadius: "3px", transition: "width 0.6s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
            <span style={{ fontSize: "11px", color: "#aaa" }}>{running ? "Henter…" : `Sidst hentet: ${fmt(s?.latestFetchedAt ?? null)}`}</span>
          </div>
        </div>

        {/* 4-segment breakdown */}
        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
            <div style={{ background: "#f0fdf4", borderRadius: "6px", padding: "8px 10px", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803d" }}>{n(s.hasIF)}</div>
              <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Har IF</div>
            </div>
            <div style={{ background: "#fff7ed", borderRadius: "6px", padding: "8px 10px", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#c2410c" }}>{n(s.noData)}</div>
              <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Ingen data</div>
            </div>
            <div style={{ background: "#f9fafb", borderRadius: "6px", padding: "8px 10px", border: "1px solid #d1d5db" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#374151" }}>{n(s.noIssn)}</div>
              <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Ingen ISSN</div>
            </div>
            <div style={{ background: "#eff6ff", borderRadius: "6px", padding: "8px 10px", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1d4ed8" }}>{n(s.pending)}</div>
              <div style={{ fontSize: "10px", color: "#5a6a85", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Afventer</div>
            </div>
          </div>
        )}

        <div>
          <button
            onClick={() => { void triggerIF(); }}
            disabled={running}
            style={{
              padding: "8px 16px", borderRadius: "7px", border: "none",
              fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              cursor: running ? "not-allowed" : "pointer",
              background: running ? "#f1f3f7" : "#E83B2A",
              color:      running ? "#9ca3af"  : "#fff",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {running ? "Henter…" : "Hent impact factor nu"}
          </button>
        </div>
      </div>
    );
  }

  // ── Default button UI ────────────────────────────────────────────────────────

  const allActions: { label: string; state: ActionState; trigger: () => Promise<void>; group: "articles" | "linking" | "author-score" }[] = [
    { label: "Kør C1 import",           state: c1State,       trigger: triggerC1,          group: "articles"     },
    { label: "Kør C2 import",           state: c2State,       trigger: triggerC2,          group: "articles"     },
    { label: "Kør forfatter-linking",   state: linkState,     trigger: triggerLinking,     group: "linking"      },
    { label: "Beregn forfatter-scores", state: authorScState, trigger: triggerAuthorScore, group: "author-score" },
  ];
  const actions = allActions.filter((a) => a.group === subset);

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      {actions.map(({ label, state, trigger }) => {
        const bg    = state === "done"    ? "#f0fdf4"
                    : state === "error"   ? "#fef2f2"
                    : state === "loading" ? "#f1f3f7"
                    :                       "#E83B2A";
        const color = state === "done"    ? "#15803d"
                    : state === "error"   ? "#b91c1c"
                    : state === "loading" ? "#9ca3af"
                    :                       "#fff";
        const btnLabel = state === "loading" ? "Starter…"
                       : state === "done"    ? "Startet ✓"
                       : state === "error"   ? "Fejl — prøv igen"
                       :                       label;
        return (
          <button
            key={label}
            onClick={() => { void trigger(); }}
            disabled={state === "loading"}
            style={{
              padding: "8px 16px", borderRadius: "7px", border: "none",
              fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              cursor: state === "loading" ? "not-allowed" : "pointer",
              background: bg, color,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {btnLabel}
          </button>
        );
      })}
    </div>
  );
}
