"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { showState, stateMissing } from "@/lib/geo/state-policy";

interface AuditAuthor {
  id: string;
  display_name: string | null;
  affiliations: string[] | null;
  city: string | null;
  country: string | null;
  hospital: string | null;
  department: string | null;
  state: string | null;
  article_count: number | null;
  cityInGeonames: boolean;
}

const TABS: { priority: number; label: string; color: string; bg: string }[] = [
  { priority: 1, label: "P1: Institution som by", color: "#c2410c", bg: "#fff7ed" },
  { priority: 2, label: "P2: By ∉ GeoNames", color: "#a16207", bg: "#fefce8" },
  { priority: 3, label: "P3: Mangler land", color: "#b91c1c", bg: "#fef2f2" },
  { priority: 4, label: "P4: Alle", color: "#6b7280", bg: "#f3f4f6" },
];

const PAGE_SIZE = 25;

export default function AuditClient() {
  const [priority, setPriority] = useState(1);
  const [offset, setOffset] = useState(0);
  const [authors, setAuthors] = useState<AuditAuthor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  // Accumulate all seen authors across batches so summary works across pages
  const [seenAuthors, setSeenAuthors] = useState<Map<string, AuditAuthor>>(new Map());
  // Track which IDs have been saved as audit_flagged to avoid duplicates
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchAuthors = useCallback(async (p: number, off: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/geo/audit-authors?priority=${p}&offset=${off}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      const fetched: AuditAuthor[] = data.authors ?? [];
      setAuthors(fetched);
      setTotal(data.total ?? 0);
      // Merge into seen map
      setSeenAuthors((prev) => {
        const next = new Map(prev);
        for (const a of fetched) next.set(a.id, a);
        return next;
      });
    } catch {
      setAuthors([]);
      setTotal(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAuthors(priority, offset);
  }, [priority, offset, fetchAuthors]);

  function handleTabClick(p: number) {
    setPriority(p);
    setOffset(0);
    setSeenAuthors(new Map());
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveFlagged() {
    // Save checked authors that haven't been saved yet
    const unsaved = [...checked].filter((id) => !savedIds.has(id));
    if (unsaved.length === 0) return;
    setSaving(true);
    for (const authorId of unsaved) {
      await fetch("/api/admin/geo/validate-author", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_id: authorId, action: "audit_flagged" }),
      });
    }
    setSavedIds((prev) => {
      const next = new Set(prev);
      for (const id of unsaved) next.add(id);
      return next;
    });
    setSaving(false);
  }

  // Summary uses seenAuthors map so checked authors from all pages are included
  const checkedAuthors = [...seenAuthors.values()].filter((a) => checked.has(a.id));
  const unsavedCount = [...checked].filter((id) => !savedIds.has(id)).length;

  // Show state column only if at least one author in batch has a state-relevant country
  const hasStateCol = authors.some((a) => showState(a.country));

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <Link href="/admin/lab/author-geo" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>
            ← Author Geo
          </Link>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700, marginTop: "8px", marginBottom: "4px" }}>
            Quick Audit
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
            Forfatter Geo Audit
          </h1>
        </div>

        {/* Priority tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {TABS.map((tab) => {
            const active = priority === tab.priority;
            return (
              <button
                key={tab.priority}
                onClick={() => handleTabClick(tab.priority)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: active ? `2px solid ${tab.color}` : "1px solid #e5e7eb",
                  background: active ? tab.bg : "#fff",
                  color: active ? tab.color : "#6b7280",
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Info bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontSize: "12px", color: "#888" }}>
            {total} forfattere · side {page} af {totalPages || 1}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            {checked.size > 0 && (
              <>
                <button
                  onClick={() => setShowSummary((v) => !v)}
                  style={{
                    padding: "5px 12px", borderRadius: "6px", border: "1px solid #e5e7eb",
                    background: showSummary ? "#1a1a1a" : "#fff",
                    color: showSummary ? "#fff" : "#374151",
                    fontSize: "12px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  {showSummary ? "Skjul" : "Vis"} sammenfatning ({checked.size})
                </button>
                {unsavedCount > 0 && (
                  <button
                    onClick={() => { void saveFlagged(); }}
                    disabled={saving}
                    style={{
                      padding: "5px 12px", borderRadius: "6px", border: "none",
                      background: saving ? "#f1f3f7" : "#E83B2A",
                      color: saving ? "#9ca3af" : "#fff",
                      fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "Gemmer…" : `Gem ${unsavedCount} flagget`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Summary panel */}
        {showSummary && checkedAuthors.length > 0 && (
          <div style={{
            background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb",
            padding: "16px 20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "10px" }}>
              Sammenfatning — {checkedAuthors.length} markeret
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {checkedAuthors.map((a) => (
                <div key={a.id} style={{
                  fontSize: "12px", background: "#f9fafb", borderRadius: "6px",
                  padding: "8px 12px", border: "1px solid #f0f0f0", lineHeight: "1.5",
                }}>
                  <span style={{ fontWeight: 600 }}>{a.display_name}</span>
                  <span style={{ color: "#888", marginLeft: "8px" }}>
                    {[a.department, a.hospital, a.city, a.state, a.country].filter(Boolean).join(" · ") || "—"}
                  </span>
                  {stateMissing(a.country, a.state) && (
                    <span style={{ color: "#ef4444", fontSize: "11px", fontWeight: 600, marginLeft: "6px" }}>
                      ⚠ Mangler state
                    </span>
                  )}
                  {a.affiliations?.[0] && (
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>
                      {a.affiliations[0].slice(0, 200)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{
          background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#888", fontSize: "13px" }}>
              Henter forfattere…
            </div>
          ) : authors.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#888", fontSize: "13px" }}>
              Ingen forfattere i denne prioritet.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb", position: "sticky", top: 0, zIndex: 10 }}>
                  <th style={{ width: "36px", padding: "10px 12px" }}></th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>Navn</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>Department</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>Hospital</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>City</th>
                  {hasStateCol && (
                    <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>State</th>
                  )}
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85" }}>Country</th>
                </tr>
              </thead>
              <tbody>
                {authors.map((a, i) => {
                  const isChecked = checked.has(a.id);
                  const missingState = stateMissing(a.country, a.state);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => toggleCheck(a.id)}
                      style={{
                        borderBottom: i < authors.length - 1 ? "1px solid #f0f0f0" : "none",
                        background: isChecked ? "#f0f9ff" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                    >
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: "pointer", accentColor: "#2563eb" }}
                        />
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                        <div>{a.display_name ?? "—"}</div>
                        {a.article_count != null && (
                          <span style={{ fontSize: "10px", color: "#888" }}>
                            {a.article_count} art.
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", color: a.department ? "#374151" : "#ccc" }}>
                        {a.department ?? "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: a.hospital ? "#374151" : "#ccc" }}>
                        {a.hospital ?? "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: a.city ? "#374151" : "#ccc" }}>
                        {a.city ?? "—"}
                      </td>
                      {hasStateCol && (
                        <td style={{
                          padding: "8px 12px",
                          color: missingState ? "#ef4444" : a.state ? "#374151" : "#ccc",
                          fontWeight: missingState ? 600 : 400,
                        }}>
                          {a.state ?? (missingState ? "MANGLER" : "—")}
                        </td>
                      )}
                      <td style={{
                        padding: "8px 12px",
                        color: a.country ? "#374151" : "#ef4444",
                        fontWeight: a.country ? 400 : 600,
                      }}>
                        {a.country ?? "NULL"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0}
            style={{
              padding: "7px 16px", borderRadius: "6px", border: "1px solid #e5e7eb",
              background: "#fff", color: offset === 0 ? "#ccc" : "#374151",
              fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
              cursor: offset === 0 ? "default" : "pointer",
            }}
          >
            ← Forrige
          </button>
          <button
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            style={{
              padding: "7px 16px", borderRadius: "6px", border: "1px solid #e5e7eb",
              background: "#fff", color: offset + PAGE_SIZE >= total ? "#ccc" : "#374151",
              fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
              cursor: offset + PAGE_SIZE >= total ? "default" : "pointer",
            }}
          >
            Næste 25 →
          </button>
        </div>
      </div>
    </div>
  );
}
