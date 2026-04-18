"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

/* ═══ Types ═══════════════════════════════════════════════════════════════════ */

interface ImportLog {
  id: string;
  filter_id: string | null;
  status: "running" | "completed" | "failed";
  articles_imported: number;
  articles_skipped: number;
  started_at: string;
  completed_at: string | null;
  pubmed_filters: { name: string; specialty: string } | null;
}

interface CircleStats {
  total: number;
  pending: number;
  included: number;
  excluded: number;
}

/* ═══ Per-circle config ═══════════════════════════════════════════════════════ */

const CIRCLES = {
  1: {
    label: "C1",
    title: "Trusted Journals",
    desc: "Artikler fra betroede neurokirurgiske tidsskrifter — auto-approved ved import",
    badge: { bg: "#dbeafe", text: "#1d4ed8" },
    approval: "Journal",
    configLabel: "Journals",
    configPlaceholder: "Journal of Neurosurgery\nNeurosurgery\nActa Neurochirurgica",
    configHelp: "Ét tidsskriftnavn per linje. Bygger automatisk PubMed-query med [TA] (Title Abbreviation).",
  },
  2: {
    label: "C2",
    title: "Extended Sources",
    desc: "Affiliations-baseret søgning — kræver validering",
    badge: { bg: "#f3e8ff", text: "#7c3aed" },
    approval: "Pending → Lab/Auto-tag",
    configLabel: "Affiliations-søgeord",
    configPlaceholder: "neurosurg\nspine surgery\nspinal cord\nneurooncology",
    configHelp: "Ét ord/udtryk per linje. Enkeltord søges med wildcard (neurosurg*[AD]), flere ord som udtryk (\"spine surgery\"[AD]). Alle linjer kombineres med OR.",
  },
  3: {
    label: "C3",
    title: "Danish Sources",
    desc: "Danske neurokirurgiske afdelinger — kræver validering",
    badge: { bg: "#fff7ed", text: "#c2410c" },
    approval: "Pending → Lab/Auto-tag",
    configLabel: "Hospital-/bynavne",
    configPlaceholder: "Rigshospitalet\nAarhus University Hospital\nOdense University Hospital",
    configHelp: "Ét navn per linje. Kombineres automatisk med neurosurg*[AD], fx (\"Copenhagen\"[AD] AND neurosurg*[AD]).",
  },
  4: {
    label: "C4",
    title: "MeSH Terms",
    desc: "Artikler tagget med neurokirurgiske MeSH-termer på tværs af alle tidsskrifter — auto-approved ved import",
    badge: { bg: "#dcfce7", text: "#15803d" },
    approval: "MeSH",
    configLabel: "MeSH Terms",
    configPlaceholder: "Neurosurgical Procedures\nSpinal Cord\nCraniotomy",
    configHelp: "Én MeSH-term per linje. Bygger automatisk PubMed-query med [MeSH Terms], fx \"Neurosurgical Procedures\"[MeSH Terms].",
  },
} as const;

/* ═══ Helpers ═════════════════════════════════════════════════════════════════ */

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function logDuration(log: ImportLog): string {
  if (!log.completed_at) return "—";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function buildQuery(circle: 1 | 2 | 3 | 4, text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  if (circle === 1) return lines.map((j) => `"${j}"[TA]`).join(" OR ");
  if (circle === 2) return lines.map((v) => (/\s/.test(v) ? `"${v}"[AD]` : `${v}*[AD]`)).join(" OR ");
  if (circle === 4) return lines.map((t) => `"${t}"[MeSH Terms]`).join(" OR ");
  return lines.map((v) => `("${v}"[AD] AND neurosurg*[AD])`).join(" OR ");
}

/* ═══ Small components ════════════════════════════════════════════════════════ */

function StatusBadge({ status }: { status: string }) {
  const s = status as "running" | "completed" | "failed";
  const colors: Record<string, React.CSSProperties> = {
    running:   { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
    completed: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
    failed:    { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" },
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      borderRadius: "999px", padding: "2px 8px",
      fontSize: "11px", fontWeight: 600,
      ...(colors[s] ?? colors.failed),
    }}>
      {s === "running" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />}
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
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

const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px", fontSize: "13px", color: "#1a1a1a", borderBottom: "1px solid #f1f3f7",
};

const kpiLabel: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px",
};

/* ═══ Main component ══════════════════════════════════════════════════════════ */

export default function CircleImportPage({ circle }: { circle: 1 | 2 | 3 | 4 }) {
  const cfg = CIRCLES[circle];
  const specialty = ACTIVE_SPECIALTY;

  // Config
  const [configText, setConfigText] = useState("");
  const [maxResults, setMaxResults] = useState(circle === 1 ? 100 : circle === 4 ? 500 : 500);
  const [showQuery, setShowQuery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [c1FilterId, setC1FilterId] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  // Import
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mindate, setMindate] = useState("");
  const [maxdate, setMaxdate] = useState("");

  // Logs
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Stats
  const [stats, setStats] = useState<CircleStats | null>(null);

  /* ── Fetch config ── */
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      if (circle === 1) {
        const res = await fetch(`/api/admin/pubmed-filters?specialty=${specialty}&circle=1`);
        const d = await res.json();
        if (d.ok && d.filters?.length > 0) {
          const f = d.filters[0];
          setC1FilterId(f.id);
          setFilterActive(f.active ?? true);
          setConfigText((f.journal_list ?? []).join("\n"));
          setMaxResults(f.max_results ?? 100);
        }
      } else if (circle === 4) {
        const res = await fetch(`/api/admin/pubmed-filters?specialty=${specialty}&circle=4`);
        const d = await res.json();
        if (d.ok && d.filters?.length > 0) {
          const f = d.filters[0];
          setC1FilterId(f.id);
          setFilterActive(f.active ?? true);
          setConfigText((f.mesh_list ?? []).join("\n"));
          setMaxResults(f.max_results ?? 500);
        }
      } else if (circle === 2) {
        const [sourcesRes, filterRes] = await Promise.all([
          fetch(`/api/admin/circle2-sources?specialty=${specialty}`),
          fetch(`/api/admin/pubmed-filters?specialty=${specialty}&circle=2`),
        ]);
        const sourcesD = await sourcesRes.json();
        if (sourcesD.ok) {
          const rows = (sourcesD.sources ?? []).filter((s: { type: string }) => s.type === "affiliation");
          setConfigText(rows.map((s: { value: string }) => s.value).join("\n"));
          if (rows.length > 0 && rows[0].max_results) setMaxResults(rows[0].max_results);
        }
        const filterD = await filterRes.json();
        if (filterD.ok && filterD.filters?.length > 0) {
          const f = filterD.filters[0];
          setC1FilterId(f.id);
          setFilterActive(f.active ?? true);
        }
      } else {
        const res = await fetch("/api/admin/circle3-sources");
        const d = await res.json();
        if (d.ok) {
          const rows = (d.sources ?? []).filter((s: { type: string }) => s.type === "affiliation");
          setConfigText(rows.map((s: { value: string }) => s.value).join("\n"));
          if (rows.length > 0 && rows[0].max_results) setMaxResults(rows[0].max_results);
        }
      }
    } finally {
      setLoadingConfig(false);
    }
  }, [circle, specialty]);

  /* ── Fetch logs ── */
  const fetchLogs = useCallback(async () => {
    const params = circle === 3
      ? "circle=3&limit=500"
      : `specialty=${specialty}&circle=${circle}&limit=500`;
    const res = await fetch(`/api/admin/import-logs?${params}`);
    const d = await res.json();
    if (d.ok) {
      setLogs(d.logs ?? []);
      if (!(d.logs ?? []).some((l: ImportLog) => l.status === "running")) {
        setImporting(false);
      }
    }
    setLoadingLogs(false);
  }, [circle, specialty]);

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/admin/import/circle-stats?circle=${circle}`);
    const d = await res.json();
    if (d.ok) setStats(d as CircleStats);
  }, [circle]);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => { void fetchStats(); }, [fetchStats]);

  // Poll while importing
  useEffect(() => {
    if (!importing) return;
    const iv = setInterval(() => { void fetchLogs(); }, 3000);
    return () => clearInterval(iv);
  }, [importing, fetchLogs]);

  /* ── Save config ── */
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      if (circle === 1) {
        const journals = configText.split("\n").map((j) => j.trim()).filter(Boolean);
        const query_string = buildQuery(1, configText);
        if (c1FilterId) {
          const res = await fetch("/api/admin/pubmed-filters", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: c1FilterId, journal_list: journals, query_string, max_results: maxResults }),
          });
          const d = await res.json();
          if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
        } else {
          const res = await fetch("/api/admin/pubmed-filters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Neurosurgery Journals", specialty, query_string, journal_list: journals, max_results: maxResults, circle: 1 }),
          });
          const d = await res.json();
          if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
          if (d.filter?.id) setC1FilterId(d.filter.id);
        }
      } else if (circle === 4) {
        const meshTerms = configText.split("\n").map((t) => t.trim()).filter(Boolean);
        const query_string = buildQuery(4, configText);
        if (c1FilterId) {
          const res = await fetch("/api/admin/pubmed-filters", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: c1FilterId, mesh_list: meshTerms, query_string, max_results: maxResults }),
          });
          const d = await res.json();
          if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
        } else {
          const res = await fetch("/api/admin/pubmed-filters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Neurosurgery MeSH Terms", specialty, query_string, mesh_list: meshTerms, max_results: maxResults, circle: 4 }),
          });
          const d = await res.json();
          if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
          if (d.filter?.id) setC1FilterId(d.filter.id);
        }
      } else if (circle === 2) {
        const terms = configText.split("\n").map((t) => t.trim()).filter(Boolean);
        const res = await fetch("/api/admin/circle2-sources", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specialty, terms, max_results: maxResults }),
        });
        const d = await res.json();
        if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
      } else {
        const terms = configText.split("\n").map((t) => t.trim()).filter(Boolean);
        const res = await fetch("/api/admin/circle3-sources", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms, max_results: maxResults }),
        });
        const d = await res.json();
        if (!d.ok) { setSaveError(d.error ?? "Fejl"); return; }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle active ── */
  async function handleToggleActive() {
    if (!c1FilterId || filterActive === null) return;
    const newActive = !filterActive;
    setTogglingActive(true);
    try {
      const res = await fetch("/api/admin/pubmed-filters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c1FilterId, active: newActive }),
      });
      const d = await res.json();
      if (d.ok) setFilterActive(newActive);
    } finally {
      setTogglingActive(false);
    }
  }

  /* ── Trigger import ── */
  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const url = circle === 1
        ? "/api/admin/pubmed/trigger-import"
        : circle === 2
          ? `/api/admin/pubmed/trigger-import-circle2?specialty=${specialty}`
          : circle === 4
            ? "/api/admin/pubmed/trigger-import-circle4"
            : "/api/admin/pubmed/trigger-import-circle3";

      const bodyObj: Record<string, string> = {};
      if (circle === 1 && c1FilterId) bodyObj.filterId = c1FilterId;
      if (mindate) {
        bodyObj.mindate = mindate.replace(/-/g, "/");
        bodyObj.maxdate = (maxdate || new Date().toISOString().slice(0, 10)).replace(/-/g, "/");
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      const d = await res.json();
      if (d.ok) {
        await fetchLogs();
      } else {
        setImportError(d.error ?? "Import fejlede");
        setImporting(false);
      }
    } catch {
      setImportError("Netværksfejl");
      setImporting(false);
    }
  }

  /* ── Derived ── */
  const latestCompleted = logs.find((l) => l.status === "completed") ?? null;

  /* ── Render ── */
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      {/* keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/import" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Import oversigt
          </Link>
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{
                fontSize: "12px", fontWeight: 700, borderRadius: "6px", padding: "3px 10px",
                background: cfg.badge.bg, color: cfg.badge.text,
              }}>
                {cfg.label}
              </span>
              <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>{cfg.title}</h1>
            </div>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{cfg.desc}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            {/* Active toggle — only for C1, C2 and C4 when filter row exists */}
            {(circle === 1 || circle === 2 || circle === 4) && c1FilterId !== null && filterActive !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={handleToggleActive}
                  disabled={togglingActive}
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    width: "36px",
                    height: "20px",
                    borderRadius: "10px",
                    border: "none",
                    cursor: togglingActive ? "not-allowed" : "pointer",
                    background: filterActive ? "#16a34a" : "#d1d5db",
                    transition: "background 0.15s",
                    padding: 0,
                    opacity: togglingActive ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                  aria-label={filterActive ? "Deaktivér daglig import" : "Aktivér daglig import"}
                >
                  <span style={{
                    position: "absolute",
                    left: filterActive ? "18px" : "2px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    transition: "left 0.15s",
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1 }}>
                    Daglig import
                  </div>
                  <div style={{ fontSize: "11px", color: filterActive ? "#15803d" : "#9ca3af", fontWeight: 600, marginTop: "2px" }}>
                    {filterActive ? "Aktiv" : "Inaktiv"}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: "9px 20px", fontSize: "13px", fontWeight: 700,
                background: importing ? "#9ca3af" : cfg.badge.text, color: "#fff",
                border: "none", borderRadius: "8px", cursor: importing ? "default" : "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: "8px",
              }}
            >
              {importing && <Spinner />}
              {importing ? "Importerer…" : "Kør import nu"}
            </button>
          </div>
        </div>

        {/* Advanced: date-range recovery */}
        {circle !== 3 && (
          <div style={{ marginBottom: "20px" }}>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              {showAdvanced ? "Skjul avanceret" : "Avanceret"}
            </button>
            {showAdvanced && (
              <div style={{
                marginTop: 10, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap",
                padding: "14px 16px", background: "#f8f9fb", borderRadius: 8, border: "1px solid #e5e7eb",
              }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    Fra (EDAT)
                  </label>
                  <input
                    type="date"
                    value={mindate}
                    onChange={(e) => setMindate(e.target.value)}
                    style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: "13px", color: "#1a1a1a", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    Til (EDAT)
                  </label>
                  <input
                    type="date"
                    value={maxdate}
                    onChange={(e) => setMaxdate(e.target.value)}
                    style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: "13px", color: "#1a1a1a", outline: "none" }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", maxWidth: 220, lineHeight: 1.5 }}>
                  Brug kun ved recovery — henter artikler inden for et specifikt EDAT-interval.
                </div>
              </div>
            )}
          </div>
        )}

        {importError && (
          <div style={{ padding: "10px 16px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {importError}
          </div>
        )}

        {/* ═══ SECTION 1: Status KPIs ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Status</span>
          </div>
          <div style={{ padding: "20px 24px", display: "flex", gap: "40px", flexWrap: "wrap" }}>
            <div>
              <div style={kpiLabel}>Artikler importeret</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: cfg.badge.text }}>
                {stats ? stats.total.toLocaleString("da-DK") : "—"}
              </div>
            </div>
            <div>
              <div style={kpiLabel}>Seneste import</div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>
                {latestCompleted ? `${latestCompleted.articles_imported} artikler` : "—"}
              </div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                {latestCompleted ? fmt(latestCompleted.started_at) : ""}
              </div>
            </div>
            <div>
              <div style={kpiLabel}>Pending</div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: (circle === 1 || circle === 4) ? "#888" : "#d97706" }}>
                {(circle === 1 || circle === 4) ? "—" : stats ? stats.pending.toLocaleString("da-DK") : "—"}
              </div>
            </div>
            <div>
              <div style={kpiLabel}>Godkendelse</div>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#1a1a1a" }}>
                {cfg.approval}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 2: Konfiguration ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Konfiguration</span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            {loadingConfig ? (
              <div style={{ fontSize: "13px", color: "#888" }}>Henter konfiguration…</div>
            ) : (
              <>
                <p style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "10px", lineHeight: 1.5 }}>
                  {cfg.configHelp}
                </p>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#5a6a85", marginBottom: "6px" }}>
                  {cfg.configLabel}
                </label>
                <textarea
                  rows={8}
                  placeholder={cfg.configPlaceholder}
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "13px",
                    border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px 14px",
                    color: "#1a1a1a", outline: "none", background: "#fff", resize: "vertical",
                  }}
                />
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#5a6a85", marginBottom: "4px" }}>
                      Max results
                    </label>
                    <input
                      type="number" min={1} max={10000}
                      value={maxResults}
                      onChange={(e) => setMaxResults(Math.max(1, parseInt(e.target.value) || (circle === 1 ? 100 : 500)))}
                      style={{
                        width: "120px", border: "1px solid #d1d5db", borderRadius: "8px",
                        padding: "8px 12px", fontSize: "13px", color: "#1a1a1a", outline: "none",
                      }}
                    />
                  </div>
                  {configText.trim() && (
                    <div style={{ alignSelf: "flex-end", paddingBottom: "4px" }}>
                      <button
                        onClick={() => setShowQuery((v) => !v)}
                        style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                      >
                        {showQuery ? "Skjul query" : "Vis query"}
                      </button>
                    </div>
                  )}
                </div>
                {showQuery && configText.trim() && (
                  <div style={{
                    marginTop: "10px", padding: "10px 14px", borderRadius: "8px",
                    background: "#f8f9fb", border: "1px solid #e5e7eb",
                    fontFamily: "monospace", fontSize: "12px", color: "#5a6a85",
                    wordBreak: "break-all", lineHeight: 1.5,
                  }}>
                    {buildQuery(circle, configText) || "—"}
                  </div>
                )}
                {saveError && (
                  <div style={{ marginTop: "10px", fontSize: "13px", color: "#b91c1c" }}>{saveError}</div>
                )}
                <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "8px 20px", fontSize: "13px", fontWeight: 600,
                      background: saving ? "#9ca3af" : cfg.badge.text, color: "#fff",
                      border: "none", borderRadius: "8px", cursor: saving ? "default" : "pointer",
                    }}
                  >
                    {saving ? "Gemmer…" : "Gem"}
                  </button>
                  {saved && <span style={{ fontSize: "12px", color: "#15803d" }}>Gemt</span>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ SECTION 3: Import log ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Import log</span>
          </div>
          {loadingLogs ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Henter log…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Ingen import-kørsler endnu</div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Dato", "Importeret", "Skipped", "Tid", "Status"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.started_at)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{log.articles_imported}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#888" }}>{log.articles_skipped}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#888" }}>{logDuration(log)}</td>
                      <td style={tdStyle}><StatusBadge status={log.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
