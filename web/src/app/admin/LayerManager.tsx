"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Filter {
  id: string;
  name: string;
  specialty: string;
  query_string: string;
  journal_list: string[] | null;
  max_results: number;
  active: boolean;
  circle: number;
  last_run_at: string | null;
}

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

interface Circle2Source {
  id: string;
  specialty: string;
  type: string;
  value: string;
  description: string | null;
  max_results: number | null;
  active: boolean | null;
  last_run_at: string | null;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_TYPES = ["mesh", "text", "author", "institution", "citation", "doi", "keyword", "affiliation"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const TYPE_BADGE_COLORS: Record<SourceType, { bg: string; text: string }> = {
  mesh:        { bg: "#dbeafe", text: "#1d4ed8" },
  text:        { bg: "#f1f5f9", text: "#475569" },
  author:      { bg: "#ede9fe", text: "#7c3aed" },
  institution: { bg: "#ffedd5", text: "#c2410c" },
  citation:    { bg: "#fef9c3", text: "#a16207" },
  doi:         { bg: "#ccfbf1", text: "#0f766e" },
  keyword:     { bg: "#fce7f3", text: "#be185d" },
  affiliation: { bg: "#dcfce7", text: "#15803d" },
};

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_BADGE_COLORS[type as SourceType] ?? { bg: "#f1f5f9", text: "#475569" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      borderRadius: "999px",
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
    }}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: ImportLog["status"] }) {
  const styles: Record<ImportLog["status"], React.CSSProperties> = {
    running:   { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
    completed: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
    failed:    { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" },
  };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      borderRadius: "999px",
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 600,
      ...styles[status],
    }}>
      {status === "running" && (
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite" }} />
      )}
      {status}
    </span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(log: ImportLog): string {
  if (!log.completed_at) return "—";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "20px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const accentLabel: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.08em",
  color: "#E83B2A",
  textTransform: "uppercase",
  fontWeight: 700,
};

const tableHeaderCell: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#5a6a85",
  borderBottom: "1px solid #eef0f4",
  background: "#f8f9fb",
};

const tableCell: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: "13px",
  color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500/20 transition";
const btnPrimary = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondary = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2";

// ─── Tab 1: Circle 1 ─────────────────────────────────────────────────────────

function journalsToQuery(raw: string): string {
  const names = raw.split("\n").map((j) => j.trim()).filter(Boolean);
  if (names.length === 0) return "";
  return names.map((j) => `"${j}"[TA]`).join(" OR ");
}

const EMPTY_FILTER_FORM = { name: "", journal_list_raw: "", max_results: 100, active: true };

function Circle1Tab({ specialty }: { specialty: string }) {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FILTER_FORM);
  const [showQuery, setShowQuery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [importing, setImporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchFilters = useCallback(async () => {
    const res = await fetch(`/api/admin/pubmed-filters?specialty=${specialty}&circle=1`);
    const d = (await res.json()) as { ok: boolean; filters?: Filter[] };
    if (d.ok) setFilters(d.filters ?? []);
    setLoadingFilters(false);
  }, [specialty]);

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/import-logs?specialty=${specialty}&circle=1`);
    const d = (await res.json()) as { ok: boolean; logs?: ImportLog[] };
    if (d.ok) {
      setLogs(d.logs ?? []);
      const hasRunning = (d.logs ?? []).some((l) => l.status === "running");
      if (!hasRunning) {
        setImporting(false);
        setJobId(null);
      }
    }
    setLoadingLogs(false);
  }, [specialty]);

  useEffect(() => { void fetchFilters(); }, [fetchFilters]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  // Poll while import is running
  useEffect(() => {
    if (!importing) return;
    const interval = setInterval(async () => {
      await fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [importing, fetchLogs]);

  function openCreate() { setForm(EMPTY_FILTER_FORM); setShowQuery(false); setFormError(null); setEditingId("new"); }
  function openEdit(f: Filter) {
    setForm({
      name: f.name,
      journal_list_raw: (f.journal_list ?? []).join("\n"),
      max_results: f.max_results,
      active: f.active,
    });
    setShowQuery(false);
    setFormError(null);
    setEditingId(f.id);
  }
  function cancelEdit() { setEditingId(null); setShowQuery(false); setFormError(null); }

  async function handleToggle(f: Filter) {
    await fetch("/api/admin/pubmed-filters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, active: !f.active }),
    });
    await fetchFilters();
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    const isNew = editingId === "new";
    const journals = form.journal_list_raw.split("\n").map((j) => j.trim()).filter(Boolean);
    const query_string = journalsToQuery(form.journal_list_raw);
    const base = { name: form.name, max_results: form.max_results, active: form.active, query_string, journal_list: journals, circle: 1 as const };
    const res = await fetch("/api/admin/pubmed-filters", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? { ...base, specialty } : { id: editingId, ...base }),
    });
    const d = (await res.json()) as { ok: boolean; error?: string };
    if (!d.ok) {
      setFormError(d.error ?? "Something went wrong");
    } else {
      setEditingId(null);
      await fetchFilters();
    }
    setSaving(false);
  }

  async function handleTriggerImport() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/admin/pubmed/trigger-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (d.ok) {
        setJobId(d.jobId ?? null);
        await fetchLogs();
      } else {
        setImportError(d.error ?? "Failed to start import");
        setImporting(false);
      }
    } catch {
      setImportError("Network error. Please try again.");
      setImporting(false);
    }
  }

  return (
    <div>
      {/* Filters section */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>PubMed Filters (Circle 1)</span>
          {editingId === null && (
            <button onClick={openCreate} className={btnPrimary} style={{ padding: "5px 14px", fontSize: "12px" }}>
              + New filter
            </button>
          )}
        </div>

        {editingId !== null && (
          <div style={{ padding: "20px", borderBottom: "1px solid #eef0f4" }}>
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                {editingId === "new" ? "Create filter" : "Edit filter"}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Neurosurgery — recent"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Max results</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={form.max_results}
                    onChange={(e) => setForm((p) => ({ ...p, max_results: Math.max(1, parseInt(e.target.value) || 100) }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Journals</label>
                <textarea
                  rows={5}
                  placeholder={"Paste journal names, one per line\ne.g.\nJournal of Neurosurgery\nNeurosurgery\nActa Neurochirurgica"}
                  value={form.journal_list_raw}
                  onChange={(e) => setForm((p) => ({ ...p, journal_list_raw: e.target.value }))}
                  className={`${inputClass} resize-y`}
                />
                {form.journal_list_raw.trim() && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowQuery((v) => !v)}
                      className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition"
                    >
                      {showQuery ? "Hide query" : "Show query"}
                    </button>
                    {showQuery && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <code className="text-xs text-slate-600 font-mono break-all">
                          {journalsToQuery(form.journal_list_raw) || "—"}
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mb-5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
              </div>
              {formError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving || !form.name || !form.journal_list_raw.trim()} className={btnPrimary}>
                  {saving ? "Saving…" : editingId === "new" ? "Create" : "Save changes"}
                </button>
                <button onClick={cancelEdit} disabled={saving} className={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loadingFilters ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Loading filters…</div>
        ) : filters.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            No Circle 1 filters yet — create one to start importing.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Query preview", "Max results", "Last run", "Active", ""].map((h) => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filters.map((f) => (
                <tr key={f.id} style={{ background: "#fff" }}>
                  <td style={{ ...tableCell, fontWeight: 600 }}>{f.name}</td>
                  <td style={{ ...tableCell, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5a6a85", fontSize: "12px" }}>
                    {f.journal_list && f.journal_list.length > 0
                      ? `${f.journal_list.length} journal${f.journal_list.length !== 1 ? "s" : ""}: ${f.journal_list.join(", ")}`
                      : <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{f.query_string}</span>
                    }
                  </td>
                  <td style={{ ...tableCell, color: "#5a6a85" }}>{f.max_results}</td>
                  <td style={{ ...tableCell, color: "#888", whiteSpace: "nowrap" }}>{fmt(f.last_run_at)}</td>
                  <td style={tableCell}>
                    <button
                      onClick={() => handleToggle(f)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${f.active ? "bg-indigo-600" : "bg-slate-200"}`}
                      aria-label={f.active ? "Deactivate" : "Activate"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${f.active ? "translate-x-4" : "translate-x-1"}`} />
                    </button>
                  </td>
                  <td style={{ ...tableCell, textAlign: "right" }}>
                    <button onClick={() => openEdit(f)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import log section */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>Import Log</span>
          <button
            onClick={handleTriggerImport}
            disabled={importing}
            className={btnPrimary}
            style={{ padding: "5px 14px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {importing && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {importing ? "Importing…" : "Run import"}
          </button>
        </div>

        {importError && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #fecaca", background: "#fef2f2" }}>
            <p style={{ fontSize: "13px", color: "#b91c1c" }}>{importError}</p>
          </div>
        )}

        {loadingLogs ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Loading logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>No import runs yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Filter", "Status", "Imported", "Duration"].map((h) => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 5).map((log) => (
                <tr key={log.id}>
                  <td style={{ ...tableCell, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.started_at)}</td>
                  <td style={tableCell}>{log.pubmed_filters?.name ?? <span style={{ color: "#888" }}>All filters</span>}</td>
                  <td style={tableCell}><StatusBadge status={log.status} /></td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums" }}>{log.articles_imported}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums", color: "#888" }}>{duration(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Circle 2 ─────────────────────────────────────────────────────────

function Circle2Tab({ specialty }: { specialty: string }) {
  const [affiliationText, setAffiliationText] = useState("");
  const [maxResults, setMaxResults] = useState(500);
  const [showQuery, setShowQuery] = useState(false);
  const [savingAffiliation, setSavingAffiliation] = useState(false);
  const [affiliationError, setAffiliationError] = useState<string | null>(null);
  const [affiliationSaved, setAffiliationSaved] = useState(false);

  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [importing, setImporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchAffiliationSources = useCallback(async () => {
    const res = await fetch(`/api/admin/circle2-sources?specialty=${specialty}`);
    const d = (await res.json()) as { ok: boolean; sources?: Circle2Source[] };
    if (d.ok) {
      const rows = (d.sources ?? []).filter((s) => s.type === "affiliation");
      setAffiliationText(rows.map((s) => s.value).join("\n"));
      if (rows.length > 0 && rows[0].max_results) setMaxResults(rows[0].max_results);
    }
  }, [specialty]);

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/import-logs?specialty=${specialty}&circle=2`);
    const d = (await res.json()) as { ok: boolean; logs?: ImportLog[] };
    if (d.ok) {
      setLogs(d.logs ?? []);
      const hasRunning = (d.logs ?? []).some((l) => l.status === "running");
      if (!hasRunning) {
        setImporting(false);
        setJobId(null);
      }
    }
    setLoadingLogs(false);
  }, [specialty]);

  useEffect(() => { void fetchAffiliationSources(); }, [fetchAffiliationSources]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  // Poll while import is running
  useEffect(() => {
    if (!importing) return;
    const interval = setInterval(async () => {
      await fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [importing, fetchLogs]);

  async function handleSaveAffiliation() {
    setSavingAffiliation(true);
    setAffiliationError(null);
    setAffiliationSaved(false);
    const terms = affiliationText.split("\n").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/admin/circle2-sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialty, terms, max_results: maxResults }),
    });
    const d = (await res.json()) as { ok: boolean; error?: string };
    if (!d.ok) {
      setAffiliationError(d.error ?? "Something went wrong");
    } else {
      setAffiliationSaved(true);
      setTimeout(() => setAffiliationSaved(false), 2500);
    }
    setSavingAffiliation(false);
  }

  async function handleRunImport() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/admin/pubmed/trigger-import-circle2?specialty=${specialty}`, {
        method: "POST",
      });
      const d = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (d.ok) {
        setJobId(d.jobId ?? null);
        await fetchLogs();
      } else {
        setImportError(d.error ?? "Failed to start import");
        setImporting(false);
      }
    } catch {
      setImportError("Network error. Please try again.");
      setImporting(false);
    }
  }

  return (
    <div>
      {/* Affiliation søgeord */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>Affiliation søgeord</span>
          <button
            onClick={handleRunImport}
            disabled={importing}
            className={btnPrimary}
            style={{ padding: "5px 14px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {importing && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {importing ? "Importing…" : "Run import"}
          </button>
        </div>
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "10px", lineHeight: 1.5 }}>
            Ét ord eller udtryk per linje. Enkeltord søges med wildcard (<code style={{ fontFamily: "monospace" }}>neurosurg*[AD]</code>), flere ord som udtryk (<code style={{ fontFamily: "monospace" }}>"spine surgery"[AD]</code>). Alle linjer kombineres med OR.
          </p>
          <textarea
            rows={8}
            placeholder={"neurosurg\nspine surgery\nspinal cord\nneurooncology"}
            value={affiliationText}
            onChange={(e) => setAffiliationText(e.target.value)}
            className={`${inputClass} resize-y`}
            style={{ fontFamily: "monospace", fontSize: "13px" }}
          />
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Max results</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, parseInt(e.target.value) || 500))}
                className={inputClass}
                style={{ width: "120px" }}
              />
            </div>
            {affiliationText.trim() && (
              <div style={{ alignSelf: "flex-end", paddingBottom: "2px" }}>
                <button
                  type="button"
                  onClick={() => setShowQuery((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition"
                >
                  {showQuery ? "Hide query" : "Show query"}
                </button>
              </div>
            )}
          </div>
          {showQuery && affiliationText.trim() && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <code className="text-xs text-slate-600 font-mono break-all">
                {affiliationText
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((v) => (/\s/.test(v) ? `"${v}"[AD]` : `${v}*[AD]`))
                  .join(" OR ") || "—"}
              </code>
            </div>
          )}
          {affiliationError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">{affiliationError}</p>
            </div>
          )}
          {importError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">{importError}</p>
            </div>
          )}
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={handleSaveAffiliation}
              disabled={savingAffiliation}
              className={btnPrimary}
              style={{ padding: "6px 16px", fontSize: "12px" }}
            >
              {savingAffiliation ? "Gemmer…" : "Gem"}
            </button>
            {affiliationSaved && (
              <span style={{ fontSize: "12px", color: "#15803d" }}>Gemt</span>
            )}
          </div>
        </div>
      </div>

      {/* Import log section */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>Import Log</span>
        </div>

        {loadingLogs ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Loading logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>No import runs yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Status", "Imported", "Skipped", "Duration"].map((h) => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 5).map((log) => (
                <tr key={log.id}>
                  <td style={{ ...tableCell, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.started_at)}</td>
                  <td style={tableCell}><StatusBadge status={log.status} /></td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums" }}>{log.articles_imported}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums", color: "#888" }}>{log.articles_skipped}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums", color: "#888" }}>{duration(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Circle 3 ─────────────────────────────────────────────────────────

interface Circle3Source {
  id: string;
  specialty: string;
  type: string;
  value: string;
  description: string | null;
  max_results: number | null;
  active: boolean;
  last_run_at: string | null;
}

function Circle3Tab() {
  const [sourceText, setSourceText] = useState("");
  const [maxResults, setMaxResults] = useState(500);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    const res = await fetch("/api/admin/circle3-sources");
    const d = (await res.json()) as { ok: boolean; sources?: Circle3Source[] };
    if (d.ok) {
      const rows = (d.sources ?? []).filter((s) => s.type === "affiliation");
      setSourceText(rows.map((s) => s.value).join("\n"));
      if (rows.length > 0 && rows[0].max_results) setMaxResults(rows[0].max_results);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/admin/import-logs?circle=3");
    const d = (await res.json()) as { ok: boolean; logs?: ImportLog[] };
    if (d.ok) {
      setLogs(d.logs ?? []);
      if (!(d.logs ?? []).some((l) => l.status === "running")) {
        setImporting(false);
      }
    }
    setLoadingLogs(false);
  }, []);

  useEffect(() => { void fetchSources(); }, [fetchSources]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!importing) return;
    const interval = setInterval(() => { void fetchLogs(); }, 3000);
    return () => clearInterval(interval);
  }, [importing, fetchLogs]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const terms = sourceText.split("\n").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/admin/circle3-sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms, max_results: maxResults }),
    });
    const d = (await res.json()) as { ok: boolean; error?: string };
    if (!d.ok) {
      setSaveError(d.error ?? "Something went wrong");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  async function handleRunImport() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/admin/pubmed/trigger-import-circle3", { method: "POST" });
      const d = (await res.json()) as { ok: boolean; error?: string };
      if (d.ok) {
        await fetchLogs();
      } else {
        setImportError(d.error ?? "Failed to start import");
        setImporting(false);
      }
    } catch {
      setImportError("Network error. Please try again.");
      setImporting(false);
    }
  }

  return (
    <div>
      {/* Kilder */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>Danske afdelinger (affiliation-søgning)</span>
          <button
            onClick={handleRunImport}
            disabled={importing}
            className={btnPrimary}
            style={{ padding: "5px 14px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {importing && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {importing ? "Importing…" : "Run import"}
          </button>
        </div>
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "10px", lineHeight: 1.5 }}>
            Ét bynavn eller hospitalsnavn per linje — ingen PubMed-syntax. Hvert navn kombineres automatisk med <code style={{ fontFamily: "monospace" }}>neurosurg*[AD]</code>, fx <code style={{ fontFamily: "monospace" }}>("Copenhagen"[AD] AND neurosurg*[AD])</code>.
          </p>
          <textarea
            rows={8}
            placeholder={"Copenhagen\nAarhus\nOdense\nAalborg"}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className={`${inputClass} resize-y`}
            style={{ fontFamily: "monospace", fontSize: "13px" }}
          />
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Max results per kørsel</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, parseInt(e.target.value) || 500))}
                className={inputClass}
                style={{ width: "120px" }}
              />
            </div>
          </div>
          {saveError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}
          {importError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-sm text-red-700">{importError}</p>
            </div>
          )}
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              className={btnPrimary}
              style={{ padding: "6px 16px", fontSize: "12px" }}
            >
              {saving ? "Gemmer…" : "Gem"}
            </button>
            {saved && <span style={{ fontSize: "12px", color: "#15803d" }}>Gemt</span>}
          </div>
        </div>
      </div>

      {/* Import log */}
      <div style={card}>
        <div style={sectionHeader}>
          <span style={accentLabel}>Import Log</span>
        </div>
        {loadingLogs ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Loading logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>No import runs yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Status", "Imported", "Skipped", "Duration"].map((h) => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 5).map((log) => (
                <tr key={log.id}>
                  <td style={{ ...tableCell, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.started_at)}</td>
                  <td style={tableCell}><StatusBadge status={log.status} /></td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums" }}>{log.articles_imported}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums", color: "#888" }}>{log.articles_skipped}</td>
                  <td style={{ ...tableCell, fontVariantNumeric: "tabular-nums", color: "#888" }}>{duration(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "circle1" | "circle2" | "circle3";

export default function LayerManager({ specialty, label, initialTab = "circle1" }: { specialty: string; label: string; initialTab?: Tab }) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const tabs: { id: Tab; label: string }[] = [
    { id: "circle1", label: "Circle 1 — Trusted Journals" },
    { id: "circle2", label: "Circle 2 — Extended Sources" },
    { id: "circle3", label: "Circle 3 — Danish Sources" },
  ];

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
      padding: "0",
    }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Back link */}
        <div style={{ marginBottom: "20px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>
            {label} · Import Layers
          </h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Manage import sources and training for {label}
          </p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          borderBottom: "2px solid #eef0f4",
          marginBottom: "28px",
          gap: "0",
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? "#1a1a1a" : "#888",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #E83B2A" : "2px solid transparent",
                marginBottom: "-2px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "circle1" && <Circle1Tab specialty={specialty} />}
        {activeTab === "circle2" && <Circle2Tab specialty={specialty} />}
        {activeTab === "circle3" && <Circle3Tab />}
      </div>
    </div>
  );
}
