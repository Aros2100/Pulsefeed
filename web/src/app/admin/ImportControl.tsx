"use client";

import { useState, useEffect, useCallback } from "react";

interface ImportLog {
  id: string;
  filter_id: string | null;
  status: "running" | "completed" | "failed";
  articles_imported: number;
  articles_skipped: number;
  errors: string[] | null;
  started_at: string;
  completed_at: string | null;
  pubmed_filters: { name: string; specialty: string } | null;
}

function StatusBadge({ status }: { status: ImportLog["status"] }) {
  const styles = {
    running:   "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function duration(log: ImportLog): string {
  if (!log.completed_at) return "—";
  const ms =
    new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImportControl() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/admin/import-logs");
    const data = (await res.json()) as { ok: boolean; logs?: ImportLog[] };
    if (data.ok) setLogs(data.logs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Poll status every 3s while a job is running
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const res = await fetch(
        `/api/admin/pubmed/import-status?jobId=${jobId}`
      );
      const data = (await res.json()) as {
        ok: boolean;
        log?: ImportLog;
      };

      if (!data.ok || !data.log) return;

      if (data.log.status !== "running") {
        clearInterval(interval);
        setJobId(null);
        setImporting(false);
        await fetchLogs();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, fetchLogs]);

  async function handleTrigger() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pubmed/trigger-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        jobId?: string;
        error?: string;
      };
      if (data.ok && data.jobId) {
        setJobId(data.jobId);
        await fetchLogs(); // Show the new "running" entry immediately
      } else {
        setError(data.error ?? "Failed to start import");
        setImporting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setImporting(false);
    }
  }

  const lastCompleted = logs.find((l) => l.status === "completed");

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            PubMed Import
          </h2>
          <p className="text-sm text-slate-500">
            {lastCompleted
              ? `Last run: ${fmt(lastCompleted.started_at)} — ${lastCompleted.articles_imported} articles imported`
              : "No completed imports yet"}
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={importing}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing && (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
          {importing ? "Importing…" : "Run import now"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Log table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No import runs yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {["Date", "Filter", "Status", "Imported", "Skipped", "Duration"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {fmt(log.started_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {log.pubmed_filters?.name ?? (
                      <span className="text-slate-400">All filters</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {log.articles_imported}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {log.articles_skipped}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {duration(log)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
