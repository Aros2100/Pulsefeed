"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AuthorData {
  id: string;
  display_name: string | null;
  affiliations: string[] | null;
  city: string | null;
  country: string | null;
  hospital: string | null;
  department: string | null;
  state: string | null;
  article_count: number | null;
}

interface ArticleData {
  id: string;
  title: string;
  journal_title: string | null;
}

interface GeoFields {
  city: string;
  country: string;
  hospital: string;
  department: string;
  state: string;
}

const INST_KEYWORDS = [
  "hospital", "university", "institute", "medical", "clinic",
  "school", "college", "center", "centre", "department", "health",
];

function looksLikeInstitution(val: string): boolean {
  const lower = val.toLowerCase();
  return INST_KEYWORDS.some((kw) => lower.includes(kw));
}

export default function AuthorGeoClient() {
  const [author, setAuthor] = useState<AuthorData | null>(null);
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [priority, setPriority] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [validated, setValidated] = useState(0);

  const [fields, setFields] = useState<GeoFields>({
    city: "", country: "", hospital: "", department: "", state: "",
  });

  const loadNext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/geo/validate-author");
      const data = await res.json();
      if (data.ok && data.author) {
        setAuthor(data.author);
        setArticles(data.articles ?? []);
        setRemaining(data.remaining ?? 0);
        setPriority(data.priority ?? 0);
        setFields({
          city: data.author.city ?? "",
          country: data.author.country ?? "",
          hospital: data.author.hospital ?? "",
          department: data.author.department ?? "",
          state: data.author.state ?? "",
        });
      } else {
        setAuthor(null);
        setArticles([]);
        setRemaining(0);
      }
    } catch {
      setAuthor(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadNext(); }, [loadNext]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function postAction(actionType: "approve" | "correct" | "insufficient_data" | "duplicate") {
    if (!author) return;
    setSaving(true);
    try {
      const payload = {
        author_id: author.id,
        action: actionType,
        ...(actionType !== "insufficient_data" && actionType !== "duplicate"
          ? {
              city: fields.city || null,
              country: fields.country || null,
              hospital: fields.hospital || null,
              department: fields.department || null,
              state: fields.state || null,
            }
          : {}),
      };
      const res = await fetch("/api/admin/geo/validate-author", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setValidated((v) => v + 1);
        setToast(actionType === "insufficient_data" ? "Markeret som utilstrækkelig" : actionType === "duplicate" ? "Markeret som dublet" : "Gemt");
        await loadNext();
      } else {
        setToast("Fejl: " + (data.error ?? "Ukendt"));
      }
    } catch {
      setToast("Netværksfejl");
    }
    setSaving(false);
  }

  function updateField(key: keyof GeoFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const isChanged = author && (
    (fields.city || null) !== (author.city ?? null) ||
    (fields.country || null) !== (author.country ?? null) ||
    (fields.hospital || null) !== (author.hospital ?? null) ||
    (fields.department || null) !== (author.department ?? null) ||
    (fields.state || null) !== (author.state ?? null)
  );

  // ── Loading / Empty ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#888", fontSize: "14px" }}>Henter forfatter…</span>
      </div>
    );
  }

  if (!author) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>&#10003;</div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px" }}>Ingen forfattere at validere</h2>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Alle forfattere med dårlig geo-data er gennemgået.
          </p>
          {validated > 0 && (
            <p style={{ fontSize: "13px", color: "#15803d", marginTop: "12px", fontWeight: 600 }}>
              {validated} valideret i denne session
            </p>
          )}
          <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "24px", fontSize: "13px", color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}>
            ← Tilbage til Lab
          </Link>
        </div>
      </div>
    );
  }

  // ── Field config ──────────────────────────────────────────────────────────────

  const fieldConfig: { key: keyof GeoFields; label: string; warn?: boolean }[] = [
    { key: "city", label: "City", warn: !!author.city && looksLikeInstitution(author.city) },
    { key: "country", label: "Country" },
    { key: "hospital", label: "Hospital / Institution" },
    { key: "department", label: "Department" },
    { key: "state", label: "State / Region" },
  ];

  // ── Main layout ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "16px", right: "16px", zIndex: 1000,
          background: "#1a1a1a", color: "#fff", padding: "10px 20px",
          borderRadius: "8px", fontSize: "13px", fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <Link href="/admin/lab" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>← Lab</Link>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700, marginTop: "8px", marginBottom: "4px" }}>
              Author Geo Validator
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Validér forfatter-lokationer</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {validated > 0 && (
              <span style={{ fontSize: "12px", color: "#15803d", fontWeight: 600 }}>
                {validated} valideret
              </span>
            )}
            <span style={{ fontSize: "12px", color: "#888", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "4px 10px", fontWeight: 600 }}>
              {remaining} i kø
            </span>
          </div>
        </div>

        {/* Split screen */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>

          {/* LEFT: Author info */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Priority badge + Name + article count */}
            <div>
              {priority > 0 && (() => {
                const cfg: Record<number, { label: string; bg: string; color: string }> = {
                  1: { label: "Institution som by", bg: "#fff7ed", color: "#c2410c" },
                  2: { label: "By ikke i GeoNames", bg: "#fefce8", color: "#a16207" },
                  3: { label: "Mangler land", bg: "#fef2f2", color: "#b91c1c" },
                  4: { label: "Standard", bg: "#f3f4f6", color: "#6b7280" },
                };
                const c = cfg[priority] ?? cfg[4];
                return (
                  <span style={{
                    display: "inline-block", fontSize: "10px", fontWeight: 700,
                    background: c.bg, color: c.color, borderRadius: "4px",
                    padding: "2px 8px", marginBottom: "6px",
                  }}>
                    P{priority}: {c.label}
                  </span>
                );
              })()}
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px" }}>
                {author.display_name ?? "Ukendt"}
              </h2>
              {author.article_count != null && (
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#E83B2A", background: "#E83B2A14", borderRadius: "4px", padding: "2px 8px" }}>
                  {author.article_count} artikel{author.article_count !== 1 ? "er" : ""}
                </span>
              )}
            </div>

            {/* Affiliations */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Affiliations
              </div>
              {(author.affiliations && author.affiliations.length > 0) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {author.affiliations.map((aff, i) => (
                    <div key={i} style={{
                      fontSize: "12px", color: "#374151", lineHeight: "1.5",
                      background: "#f9fafb", borderRadius: "6px", padding: "8px 10px",
                      border: "1px solid #f0f0f0",
                    }}>
                      <span style={{ color: "#aaa", fontWeight: 600, marginRight: "6px" }}>{i + 1}.</span>
                      {aff}
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "12px", color: "#aaa" }}>Ingen affiliations</span>
              )}
            </div>

            {/* Articles */}
            {articles.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                  Artikler
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {articles.map((art) => (
                    <Link
                      key={art.id}
                      href={`/admin/articles/${art.id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{
                        fontSize: "12px", lineHeight: "1.4",
                        background: "#f9fafb", borderRadius: "6px", padding: "8px 10px",
                        border: "1px solid #f0f0f0", transition: "border-color 0.15s",
                      }}>
                        <div style={{ fontWeight: 500, color: "#1a1a1a" }}>
                          {art.title?.slice(0, 120)}{(art.title?.length ?? 0) > 120 ? "…" : ""}
                        </div>
                        {art.journal_title && (
                          <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                            {art.journal_title}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Editable fields */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px" }}>
              Geo-felter
            </div>

            {fieldConfig.map(({ key, label, warn }) => (
              <div key={key}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                  {label}
                  {warn && (
                    <span style={{ fontSize: "10px", color: "#d97706", fontWeight: 600, marginLeft: "8px" }}>
                      Ligner institution
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={fields[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: "7px", fontSize: "13px",
                    fontFamily: "inherit",
                    border: `1.5px solid ${warn ? "#d97706" : "#e5e7eb"}`,
                    background: warn ? "#fffbeb" : "#fff",
                    outline: "none",
                    transition: "border-color 0.15s",
                    boxSizing: "border-box" as const,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#E83B2A"; }}
                  onBlur={(e) => { e.target.style.borderColor = warn ? "#d97706" : "#e5e7eb"; }}
                />
              </div>
            ))}

            {/* Buttons */}
            <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => { void postAction(isChanged ? "correct" : "approve"); }}
                disabled={saving}
                style={{
                  flex: 1, padding: "10px 16px", borderRadius: "7px", border: "none",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: isChanged
                    ? (saving ? "#f1f3f7" : "#2563eb")
                    : (saving ? "#f1f3f7" : "#15803d"),
                  color: saving ? "#9ca3af" : "#fff",
                  transition: "background 0.15s",
                }}
              >
                {saving ? "Gemmer…" : isChanged ? "Korriger og gem" : "Godkend"}
              </button>
              <button
                type="button"
                onClick={() => { void postAction("insufficient_data"); }}
                disabled={saving}
                style={{
                  padding: "10px 16px", borderRadius: "7px", border: "none",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: saving ? "#f1f3f7" : "#d97706",
                  color: saving ? "#9ca3af" : "#fff",
                  transition: "background 0.15s",
                }}
              >
                Utilstrækkelig data
              </button>
              <button
                type="button"
                onClick={() => { void postAction("duplicate"); }}
                disabled={saving}
                style={{
                  padding: "10px 16px", borderRadius: "7px", border: "none",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: saving ? "#f1f3f7" : "#7c3aed",
                  color: saving ? "#9ca3af" : "#fff",
                  transition: "background 0.15s",
                }}
              >
                Dublet
              </button>
              <button
                type="button"
                onClick={() => { void loadNext(); }}
                disabled={saving}
                style={{
                  padding: "10px 16px", borderRadius: "7px", border: "1px solid #e5e7eb",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: "#fff", color: "#888",
                  transition: "background 0.15s",
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
