"use client";

import { useState, useEffect, useCallback } from "react";
import { SPECIALTIES } from "@/lib/auth/specialties";

interface Filter {
  id: string;
  name: string;
  specialty: string;
  query_string: string;
  max_results: number;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
}

const EMPTY_FORM = {
  name: "",
  specialty: "",
  query_string: "",
  max_results: 100,
  active: true,
};

function SpecialtyBadge({ slug }: { slug: string }) {
  const label =
    SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      {label}
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

export default function FilterManager() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchFilters = useCallback(async () => {
    const res = await fetch("/api/admin/pubmed-filters");
    const data = (await res.json()) as { ok: boolean; filters?: Filter[] };
    if (data.ok) setFilters(data.filters ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchFilters();
  }, [fetchFilters]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(filter: Filter) {
    setForm({
      name: filter.name,
      specialty: filter.specialty,
      query_string: filter.query_string,
      max_results: filter.max_results,
      active: filter.active,
    });
    setFormError(null);
    setEditingId(filter.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleToggle(filter: Filter) {
    await fetch("/api/admin/pubmed-filters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: filter.id, active: !filter.active }),
    });
    await fetchFilters();
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);

    const isNew = editingId === "new";
    const res = await fetch("/api/admin/pubmed-filters", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? form : { id: editingId, ...form }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };

    if (!data.ok) {
      setFormError(data.error ?? "Something went wrong");
    } else {
      setEditingId(null);
      await fetchFilters();
    }

    setSaving(false);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500/20 transition";

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            PubMed Filters
          </h2>
          <p className="text-sm text-slate-500">
            Define the queries used to fetch articles for each specialty.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            + New filter
          </button>
        )}
      </div>

      {/* Inline create/edit form */}
      {editingId !== null && (
        <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            {editingId === "new" ? "Create filter" : "Edit filter"}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. Neurosurgery — recent"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Specialty
              </label>
              <select
                value={form.specialty}
                onChange={(e) =>
                  setForm((p) => ({ ...p, specialty: e.target.value }))
                }
                className={`${inputClass} bg-white appearance-none`}
              >
                <option value="" disabled>
                  Select specialty…
                </option>
                {SPECIALTIES.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Max results
              </label>
              <input
                type="number"
                min={1}
                max={10000}
                value={form.max_results}
                onChange={(e) =>
                  setForm((p) => ({ ...p, max_results: Math.max(1, parseInt(e.target.value) || 100) }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              PubMed query string
            </label>
            <textarea
              rows={4}
              placeholder={`Paste your PubMed query here.\ne.g. (neurosurgery[MeSH] OR glioblastoma[Title/Abstract]) AND ("2024"[PDAT])`}
              value={form.query_string}
              onChange={(e) =>
                setForm((p) => ({ ...p, query_string: e.target.value }))
              }
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </div>

          <div className="mb-5">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((p) => ({ ...p, active: e.target.checked }))
                }
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
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.specialty || !form.query_string}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : editingId === "new" ? "Create" : "Save changes"}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter list */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading filters…
          </div>
        ) : filters.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No filters yet — create one to start importing articles.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {["Name", "Specialty", "Last run", "Active", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filters.map((filter) => (
                <tr
                  key={filter.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {filter.name}
                  </td>
                  <td className="px-4 py-3">
                    <SpecialtyBadge slug={filter.specialty} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {fmt(filter.last_run_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(filter)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                        filter.active ? "bg-indigo-600" : "bg-slate-200"
                      }`}
                      aria-label={filter.active ? "Deactivate" : "Activate"}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
                          filter.active ? "translate-x-4" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(filter)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                    >
                      Edit
                    </button>
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
