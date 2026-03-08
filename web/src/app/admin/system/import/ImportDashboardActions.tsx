"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  specialtySlugs: string[];
  subset: "articles" | "linking" | "citations" | "impact-factor" | "author-score" | "cleanup";
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
  withIF:          number;
  withoutIF:       number;
  total:           number;
  pct:             number;
  latestFetchedAt: string | null;
}

function n(v: number) { return v.toLocaleString("da-DK"); }

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
  const [c3State,        setC3State]        = useState<ActionState>("idle");
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
      if (data.withIF === ifLastWithCount.current) {
        ifStableCount.current++;
        if (ifStableCount.current >= 3) { stopIFPolling(); setIfState("done"); }
      } else {
        ifStableCount.current   = 0;
        ifLastWithCount.current = data.withIF;
      }
    }, 3000);
  }

  // ── Mount effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (subset === "citations")     { void fetchCitStats(); }
    if (subset === "impact-factor") { void fetchIFStats(); }
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

  async function triggerC3() {
    setC3State("loading");
    try {
      const res  = await fetch("/api/admin/pubmed/trigger-import-circle3", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setC3State(json.ok ? "done" : "error");
    } catch { setC3State("error"); }
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
      ifLastWithCount.current = current?.withIF ?? null;
      startIFPolling();
    } catch { setIfState("error"); }
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
    return (
      <ProgressUI
        pct={ifStats?.pct ?? 0}
        left={ifStats ? `${n(ifStats.withIF)} / ${n(ifStats.total)} artikler` : "—"}
        right={ifStats ? `${n(ifStats.withoutIF)} mangler` : ""}
        running={ifState === "loading"}
        footer={`Sidst hentet: ${fmt(ifStats?.latestFetchedAt ?? null)}`}
        onTrigger={() => { void triggerIF(); }}
        btnLabel="Hent impact factor nu"
      />
    );
  }

  // ── Default button UI ────────────────────────────────────────────────────────

  const allActions: { label: string; state: ActionState; trigger: () => Promise<void>; group: "articles" | "linking" | "author-score" }[] = [
    { label: "Kør C1 import",           state: c1State,       trigger: triggerC1,          group: "articles"     },
    { label: "Kør C2 import",           state: c2State,       trigger: triggerC2,          group: "articles"     },
    { label: "Kør C3 import",           state: c3State,       trigger: triggerC3,          group: "articles"     },
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
