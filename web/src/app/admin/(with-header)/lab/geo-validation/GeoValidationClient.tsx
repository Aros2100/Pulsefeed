"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Link from "next/link";

type Pipeline = {
  country:     string | null;
  city:        string | null;
  state:       string | null;
  institution: string | null;
  department:  string | null;
};

type SourcePerField = Record<string, "parser" | "enrichment" | "ai">;

type Article = {
  pubmed_id:        string;
  affiliation:      string | null;
  bucket:           string;
  pipeline:         Pipeline;
  sourcePerField:   SourcePerField;
};

type ProgressRow = {
  bucket:    string;
  total:     number;
  validated: number;
};

type VerdictType = "correct" | "wrong_value" | "missing" | "hallucinated" | "fragment" | "";

const FIELDS = ["department", "institution", "state", "city", "country"] as const;
type Field = typeof FIELDS[number];

const FIELD_LABELS: Record<Field, string> = {
  country:     "Country",
  city:        "City",
  state:       "State",
  institution: "Institution",
  department:  "Department",
};

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  parser:      { bg: "#f0f9ff", text: "#0284c7" },
  enrichment:  { bg: "#f0fdf4", text: "#15803d" },
  ai:          { bg: "#fef3c7", text: "#d97706" },
};

const VERDICT_COLORS: Record<VerdictType, string> = {
  correct:      "#15803d",
  wrong_value:  "#dc2626",
  missing:      "#d97706",
  hallucinated: "#7c3aed",
  fragment:     "#0284c7",
  "":           "#bbb",
};

const VERDICT_LABELS: Record<VerdictType, string> = {
  correct:      "Correct",
  wrong_value:  "Wrong value",
  missing:      "Missing",
  hallucinated: "Hallucinated",
  fragment:     "Fragment",
  "":           "—",
};

function computeVerdict(pipeline: string | null, truth: string | null, isFragment: boolean): VerdictType {
  if (isFragment) return "fragment";
  const pNorm = (pipeline ?? "").trim().toLowerCase();
  const tNorm = (truth ?? "").trim().toLowerCase();
  const pEmpty = pNorm === "";
  const tEmpty = tNorm === "";
  if (pEmpty && tEmpty) return "correct";
  if (pEmpty && !tEmpty) return "missing";
  if (!pEmpty && tEmpty) return "hallucinated";
  if (pNorm === tNorm) return "correct";
  return "wrong_value";
}

type Props = { bucket: string };

export default function GeoValidationClient({ bucket }: Props) {
  const [article,   setArticle]   = useState<Article | null>(null);
  const [progress,  setProgress]  = useState<ProgressRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [done,      setDone]      = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const [truth,    setTruth]    = useState<Record<Field, string>>({ department: "", institution: "", state: "", city: "", country: "" });
  const [fragment, setFragment] = useState<{ institution: boolean; department: boolean }>({ institution: false, department: false });
  const [notes,    setNotes]    = useState("");

  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/geo-validation/next?bucket=${encodeURIComponent(bucket)}`);
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Failed to load"); return; }

      setProgress(data.progress ?? []);
      if (!data.article) { setDone(true); setArticle(null); return; }

      const art = data.article;
      setArticle(art);
      // Pre-fill truth with pipeline values so no-change → correct verdict
      setTruth({
        department:  art.pipeline.department  ?? "",
        institution: art.pipeline.institution ?? "",
        state:       art.pipeline.state       ?? "",
        city:        art.pipeline.city        ?? "",
        country:     art.pipeline.country     ?? "",
      });
      setFragment({ institution: false, department: false });
      setNotes("");
      setDone(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setTimeout(() => firstInputRef.current?.focus(), 80);
    }
  }, [bucket]);

  useEffect(() => { fetchNext(); }, [fetchNext]);

  const handleSave = useCallback(async () => {
    if (!article || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        pubmed_id:                 article.pubmed_id,
        affiliation:               article.affiliation,
        bucket:                    article.bucket,
        pipeline:                  article.pipeline,
        pipeline_source_per_field: article.sourcePerField,
        truth: {
          country:     truth.country.trim() || null,
          city:        truth.city.trim() || null,
          state:       truth.state.trim() || null,
          institution: truth.institution.trim() || null,
          department:  truth.department.trim() || null,
        },
        fragment,
        notes: notes.trim() || null,
      };
      const res  = await fetch("/api/geo-validation/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Failed to save"); return; }
      setSavedCount((n) => n + 1);
      await fetchNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [article, truth, fragment, notes, saving, fetchNext]);

  // Keyboard shortcut: Ctrl/Cmd+Enter → save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const currentBucketProgress = progress.find((p) => p.bucket === bucket);
  const bTotal = Number(currentBucketProgress?.total ?? 0);
  const bDone  = Number(currentBucketProgress?.validated ?? 0) + savedCount;
  const bPct   = bTotal > 0 ? Math.round((bDone / bTotal) * 100) : 0;

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Back + progress row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <Link href="/admin/lab/geo-validation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Geo Validation
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>
              {bDone} / {bTotal}
            </span>
            <div style={{ width: "120px", background: "#e5e7eb", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
              <div style={{
                background: "#15803d",
                width: `${bPct}%`,
                height: "100%",
                borderRadius: "4px",
                transition: "width 0.3s",
              }} />
            </div>
            <span style={{ fontSize: "12px", color: "#888" }}>{bPct}%</span>
          </div>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Geo Validation · <span style={{ color: "#5a6a85", fontWeight: 500 }}>{bucket}</span>
          </h1>
          <p style={{ fontSize: "12px", color: "#aaa", marginTop: "4px" }}>
            ⌘↩ / Ctrl↩ to save and advance
          </p>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#dc2626",
            fontSize: "13px",
            marginBottom: "16px",
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ color: "#888", fontSize: "14px", padding: "40px 0", textAlign: "center" as const }}>
            Loading…
          </div>
        )}

        {!loading && done && (
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "12px",
            padding: "40px",
            textAlign: "center" as const,
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#15803d" }}>
              Bucket done
            </div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
              All articles in &quot;{bucket}&quot; have been validated
            </div>
            <Link
              href="/admin/lab/geo-validation"
              style={{
                display: "inline-block",
                marginTop: "20px",
                fontSize: "13px",
                color: "#5a6a85",
                textDecoration: "none",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              ← Back to buckets
            </Link>
          </div>
        )}

        {!loading && article && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Affiliation card */}
            <div style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              padding: "20px 24px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: "8px" }}>
                Affiliation · {article.pubmed_id}
              </div>
              <p style={{ fontSize: "14px", lineHeight: "1.6", margin: 0, color: "#1a1a1a" }}>
                {article.affiliation ?? <span style={{ color: "#bbb" }}>—</span>}
              </p>
            </div>

            {/* Field validation table */}
            <div style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 80px 1fr 90px 100px",
                gap: "0",
                padding: "10px 16px",
                background: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
              }}>
                {["Field", "Pipeline value", "Source", "Truth (enter correct value)", "Fragment", "Verdict"].map((h) => (
                  <span key={h} style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {FIELDS.map((field, idx) => {
                const pipelineVal = article.pipeline[field];
                const truthVal    = truth[field];
                const isFragment  = (field === "institution" && fragment.institution) || (field === "department" && fragment.department);
                const verdict     = computeVerdict(pipelineVal, truthVal, isFragment);
                const source      = article.sourcePerField[field] ?? "parser";
                const sourceStyle = SOURCE_COLORS[source] ?? SOURCE_COLORS.parser;

                return (
                  <div
                    key={field}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 1fr 80px 1fr 90px 100px",
                      gap: "0",
                      padding: "12px 16px",
                      borderBottom: idx < FIELDS.length - 1 ? "1px solid #f3f4f6" : "none",
                      alignItems: "center",
                    }}
                  >
                    {/* Field label */}
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                      {FIELD_LABELS[field]}
                    </span>

                    {/* Pipeline value */}
                    <span style={{
                      fontSize: "13px",
                      color: pipelineVal ? "#1a1a1a" : "#bbb",
                      paddingRight: "12px",
                    }}>
                      {pipelineVal ?? "—"}
                    </span>

                    {/* Source badge */}
                    <span style={{
                      display: "inline-block",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase" as const,
                      background: sourceStyle.bg,
                      color: sourceStyle.text,
                      borderRadius: "4px",
                      padding: "2px 6px",
                      width: "fit-content",
                    }}>
                      {source}
                    </span>

                    {/* Truth input */}
                    <input
                      ref={idx === 0 ? firstInputRef : undefined}
                      type="text"
                      value={truthVal}
                      onChange={(e) => setTruth((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder="empty"
                      autoComplete="new-password"
                      style={{
                        fontSize: "13px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        outline: "none",
                        width: "100%",
                        boxSizing: "border-box" as const,
                        marginRight: "12px",
                        color: "#1a1a1a",
                        background: "#fafafa",
                      }}
                    />

                    {/* Fragment checkbox (institution/department only) */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {(field === "institution" || field === "department") ? (
                        <>
                          <input
                            type="checkbox"
                            id={`frag-${field}`}
                            checked={field === "institution" ? fragment.institution : fragment.department}
                            onChange={(e) => setFragment((prev) => ({ ...prev, [field]: e.target.checked }))}
                            style={{ cursor: "pointer" }}
                          />
                          <label htmlFor={`frag-${field}`} style={{ fontSize: "12px", color: "#5a6a85", cursor: "pointer" }}>
                            Fragment
                          </label>
                        </>
                      ) : null}
                    </div>

                    {/* Verdict preview */}
                    <span style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: VERDICT_COLORS[verdict],
                    }}>
                      {VERDICT_LABELS[verdict]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <div style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              padding: "16px 20px",
            }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em", textTransform: "uppercase" as const, display: "block", marginBottom: "8px" }}>
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Add a note about this affiliation…"
                style={{
                  width: "100%",
                  fontSize: "13px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  outline: "none",
                  resize: "vertical" as const,
                  boxSizing: "border-box" as const,
                  color: "#1a1a1a",
                  background: "#fafafa",
                  lineHeight: "1.5",
                }}
              />
            </div>

            {/* Action bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
            }}>
              <span style={{ fontSize: "12px", color: "#aaa" }}>
                {savedCount} validated in this session
              </span>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: saving ? "#e5e7eb" : "#1a1a1a",
                  color: saving ? "#9ca3af" : "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {saving ? "Saving…" : "Save and next →"}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
