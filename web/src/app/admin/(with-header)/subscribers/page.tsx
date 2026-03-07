"use client";

import { useEffect, useState, useCallback } from "react";
import type { Database } from "@/lib/supabase/types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const SPECIALTIES: Record<string, string> = {
  neurosurgery: "Neurosurgery",
  cardiology: "Cardiology",
  oncology: "Oncology",
  orthopaedics: "Orthopaedics",
  emergency: "Emergency Medicine",
  radiology: "Radiology",
  internal: "Internal Medicine",
  general_surgery: "General Surgery",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  unsubscribed: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
  paused: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

type SortField = "name" | "email" | "subscribed_at" | "status" | "role";
type SortDir = "asc" | "desc";

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colors = [
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${color}`}
    >
      {initials || "?"}
    </span>
  );
}

function StatusBadge({ status }: { status: UserRow["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : status === "unsubscribed"
            ? "bg-rose-500"
            : "bg-amber-500"
        }`}
      />
      {status}
    </span>
  );
}

function RoleDropdown({ sub, onRoleChange }: { sub: UserRow; onRoleChange: (id: string, role: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [currentRole, setCurrentRole] = useState(sub.role ?? "subscriber");

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    const prevRole = currentRole;
    setCurrentRole(newRole);
    setSaving(true);
    try {
      await onRoleChange(sub.id, newRole);
    } catch {
      setCurrentRole(prevRole);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      <select
        value={currentRole}
        onChange={handleChange}
        disabled={saving}
        className={`rounded-lg border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-colors ${
          currentRole === "admin"
            ? "border-indigo-200 bg-indigo-50 text-indigo-700 focus:border-indigo-400"
            : "border-slate-200 bg-white text-slate-600 focus:border-slate-400"
        } disabled:opacity-60`}
      >
        <option value="subscriber">Subscriber</option>
        <option value="admin">Admin</option>
      </select>
      {saving && (
        <svg className="h-3.5 w-3.5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-slate-100 animate-pulse" style={{ width: `${60 + i * 8}%` }} />
        </td>
      ))}
    </tr>
  );
}

type ModalMode = "create" | "edit" | null;

interface SubscriberModalProps {
  mode: ModalMode;
  subscriber: Partial<UserRow>;
  onClose: () => void;
  onSave: (data: Partial<UserRow>) => Promise<void>;
}

function SubscriberModal({ mode, subscriber, onClose, onSave }: SubscriberModalProps) {
  const [form, setForm] = useState<Partial<UserRow>>(subscriber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof UserRow, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === "create" ? "Opret subscriber" : "Rediger subscriber"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Navn</label>
              <input
                type="text"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Dr. Anders Nielsen"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail *</label>
              <input
                type="email"
                required
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="anders@hospital.dk"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
              <select
                value={form.status ?? "active"}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="active">Active</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Kilde</label>
              <select
                value={form.source ?? "manual"}
                onChange={(e) => set("source", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="manual">Manuel</option>
                <option value="import">Import</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Specialer</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SPECIALTIES).map(([slug, label]) => {
                const selected = (form.specialty_slugs ?? []).includes(slug);
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => {
                      const current = form.specialty_slugs ?? [];
                      set(
                        "specialty_slugs",
                        selected ? current.filter((s) => s !== slug) : [...current, slug]
                      );
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Frekvens</label>
              <select
                value={form.frequency ?? "weekly"}
                onChange={(e) => set("frequency", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="weekly">Ugentlig</option>
                <option value="biweekly">Hver 2. uge</option>
                <option value="monthly">Månedlig</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Format</label>
              <select
                value={form.email_format ?? "full"}
                onChange={(e) => set("email_format", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="full">Fuld digest</option>
                <option value="headlines">Headlines only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Noter</label>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Interne noter om denne subscriber..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {saving ? "Gemmer..." : mode === "create" ? "Opret" : "Gem ændringer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("subscribed_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [modal, setModal] = useState<{ mode: ModalMode; subscriber: Partial<UserRow> }>({
    mode: null,
    subscriber: {},
  });

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/subscribers");
    if (res.ok) {
      const data = await res.json();
      setSubscribers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  const handleSave = async (data: Partial<UserRow>) => {
    const isEdit = modal.mode === "edit";
    const res = await fetch(
      isEdit ? `/api/admin/subscribers/${data.id}` : "/api/admin/subscribers",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Fejl ved gem");
    }
    await fetchSubscribers();
  };

  const handleStatusToggle = async (sub: UserRow) => {
    const newStatus = sub.status === "active" ? "unsubscribed" : "active";
    await fetch(`/api/admin/subscribers/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchSubscribers();
  };

  const handleRoleChange = async (id: string, role: string) => {
    const res = await fetch(`/api/admin/users/${id}/set-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Fejl ved rolleændring");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Navn", "E-mail", "Status", "Specialer", "Frekvens", "Kilde", "Oprettet"];
    const rows = filtered.map((s) => [
      s.name,
      s.email,
      s.status,
      (s.specialty_slugs ?? []).join("; "),
      s.frequency,
      s.source,
      new Date(s.subscribed_at).toLocaleDateString("da-DK"),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = subscribers
    .filter((s) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q || s.email.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      let av = a[sortField] ?? "";
      let bv = b[sortField] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const counts = {
    all: subscribers.length,
    active: subscribers.filter((s) => s.status === "active").length,
    unsubscribed: subscribers.filter((s) => s.status === "unsubscribed").length,
    paused: subscribers.filter((s) => s.status === "paused").length,
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg
      className={`ml-1 inline h-3.5 w-3.5 transition-opacity ${sortField === field ? "opacity-100" : "opacity-30"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      {sortField === field && sortDir === "desc" ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      )}
    </svg>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-8">
        {/* Back link */}
        <div className="mb-4">
          <a href="/admin" className="text-sm text-slate-500 hover:text-slate-700 no-underline transition-colors">
            ← Admin
          </a>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Subscribers</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Eksporter CSV
            </button>
            <button
              onClick={() => setModal({ mode: "create", subscriber: { status: "active", source: "manual", frequency: "weekly", email_format: "full", specialty_slugs: [] } })}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Opret ny
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {(["all", "active", "unsubscribed", "paused"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border p-4 text-left transition-all ${
                statusFilter === s
                  ? "border-indigo-200 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-2xl font-bold text-slate-900">{counts[s]}</div>
              <div className="mt-0.5 text-xs font-medium capitalize text-slate-500">
                {s === "all" ? "Total" : s}
              </div>
            </button>
          ))}
        </div>

        {/* Search + filter */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søg navn eller e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <span className="text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? "subscriber" : "subscribers"}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("name")} className="flex items-center font-medium text-slate-600 hover:text-slate-900">
                    Navn <SortIcon field="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("email")} className="flex items-center font-medium text-slate-600 hover:text-slate-900">
                    E-mail <SortIcon field="email" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("status")} className="flex items-center font-medium text-slate-600 hover:text-slate-900">
                    Status <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Specialer</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Rolle</th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("subscribed_at")} className="flex items-center font-medium text-slate-600 hover:text-slate-900">
                    Oprettet <SortIcon field="subscribed_at" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    {search ? "Ingen subscribers matcher din søgning" : "Ingen subscribers endnu"}
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => (
                  <tr key={sub.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={sub.name || sub.email} />
                        <span className="font-medium text-slate-900">{sub.name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sub.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(sub.specialty_slugs ?? []).slice(0, 2).map((slug) => (
                          <span key={slug} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {SPECIALTIES[slug] ?? slug}
                          </span>
                        ))}
                        {(sub.specialty_slugs ?? []).length > 2 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            +{sub.specialty_slugs!.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleDropdown sub={sub} onRoleChange={handleRoleChange} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(sub.subscribed_at).toLocaleDateString("da-DK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal({ mode: "edit", subscriber: sub })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          Rediger
                        </button>
                        <button
                          onClick={() => handleStatusToggle(sub)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            sub.status === "active"
                              ? "border border-rose-200 text-rose-600 hover:bg-rose-50"
                              : "border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          {sub.status === "active" ? "Afmeld" : "Genaktiver"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {modal.mode && (
        <SubscriberModal
          mode={modal.mode}
          subscriber={modal.subscriber}
          onClose={() => setModal({ mode: null, subscriber: {} })}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
