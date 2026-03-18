"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Author {
  id: string;
  display_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  hospital: string | null;
  department: string | null;
  openalex_id: string | null;
  orcid: string | null;
  article_count: number | null;
}

const GEO_FIELDS = ["country", "city", "state", "hospital", "department"] as const;
type GeoField = typeof GEO_FIELDS[number];

const FIELD_LABELS: Record<GeoField, string> = {
  country:    "Land",
  city:       "By",
  state:      "Stat",
  hospital:   "Hospital",
  department: "Afdeling",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", gap: "8px", fontSize: "12px", alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ color: "#9ca3af", width: "68px", flexShrink: 0, textAlign: "right" as const }}>
        {label}
      </span>
      <span style={{ color: value ? "#374151" : "#d1d5db" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function MergeClient({ primary, candidate }: { primary: Author; candidate: Author }) {
  const router = useRouter();

  // Initialize resolvedFields with primary's values for all geo fields
  const [resolvedFields, setResolvedFields] = useState<Record<GeoField, string | null>>(() => {
    const init = {} as Record<GeoField, string | null>;
    for (const f of GEO_FIELDS) init[f] = primary[f] ?? null;
    return init;
  });

  const [merging, setMerging]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Determine conflicts: fields where primary and candidate differ (null === null counts as equal)
  const conflicts = GEO_FIELDS.filter((f) => {
    const pv = primary[f] ?? null;
    const cv = candidate[f] ?? null;
    return pv !== cv;
  });

  // Button is enabled when all conflicts have a resolved value chosen
  // (they all start with primary's value, so button is immediately enabled if no conflicts OR all auto-resolved)
  const allResolved = conflicts.every((f) => resolvedFields[f] !== undefined);

  async function handleMerge() {
    if (!allResolved) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/user/author-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slave_ids: [candidate.id],
          resolved_fields: resolvedFields,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Ukendt fejl");
      setToast("Profiler er slået sammen");
      setTimeout(() => router.push("/profile"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge fejlede");
      setMerging(false);
    }
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed" as const, top: "16px", right: "16px", zIndex: 1000,
          background: "#1a1a1a", color: "#fff", padding: "10px 20px",
          borderRadius: "8px", fontSize: "13px", fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <Link href="/profile" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Min profil
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "12px 0 0" }}>
            Sammenlæg forfatterprofiler
          </h1>
        </div>

        {/* Two cards side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          {/* Primary card */}
          <div style={{
            background: "#fff", borderRadius: "12px",
            border: "2px solid #E83B2A",
            padding: "20px",
            position: "relative" as const,
          }}>
            <div style={{
              position: "absolute" as const, top: 0, right: "16px",
              background: "#E83B2A", color: "#fff",
              fontSize: "10px", fontWeight: 700, padding: "2px 8px",
              borderRadius: "0 0 6px 6px", letterSpacing: "0.05em",
            }}>
              PRIMÆR
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", paddingRight: "60px" }}>
              {primary.display_name ?? "—"}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "2px" }}>
              <Field label="OpenAlex" value={primary.openalex_id} />
              <Field label="ORCID"    value={primary.orcid} />
              <Field label="Artikler" value={String(primary.article_count ?? 0)} />
              <Field label="Land"     value={primary.country} />
              <Field label="By"       value={primary.city} />
              <Field label="Stat"     value={primary.state} />
              <Field label="Hospital" value={primary.hospital} />
              <Field label="Afdeling" value={primary.department} />
            </div>
          </div>

          {/* Candidate card */}
          <div style={{
            background: "#fff", borderRadius: "12px",
            border: "1px solid #e5e7eb",
            padding: "20px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>
              {candidate.display_name ?? "—"}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "2px" }}>
              <Field label="OpenAlex" value={candidate.openalex_id} />
              <Field label="ORCID"    value={candidate.orcid} />
              <Field label="Artikler" value={String(candidate.article_count ?? 0)} />
              <Field label="Land"     value={candidate.country} />
              <Field label="By"       value={candidate.city} />
              <Field label="Stat"     value={candidate.state} />
              <Field label="Hospital" value={candidate.hospital} />
              <Field label="Afdeling" value={candidate.department} />
            </div>
          </div>
        </div>

        {/* Conflict resolution */}
        {conflicts.length > 0 && (
          <div style={{
            background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb",
            padding: "20px 24px", marginBottom: "24px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "16px", color: "#374151" }}>
              Løs konflikter — vælg hvilken værdi der skal beholdes
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "16px" }}>
              {conflicts.map((f) => {
                const pv = primary[f] ?? null;
                const cv = candidate[f] ?? null;
                const selected = resolvedFields[f];
                return (
                  <div key={f}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "8px" }}>
                      {FIELD_LABELS[f]}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {[
                        { value: pv, label: pv ?? "(tom)", source: "Primær" },
                        { value: cv, label: cv ?? "(tom)", source: "Kandidat" },
                      ].map(({ value, label, source }) => {
                        const isSelected = selected === value;
                        return (
                          <button
                            key={source}
                            type="button"
                            onClick={() => setResolvedFields((prev) => ({ ...prev, [f]: value }))}
                            style={{
                              padding: "8px 14px", borderRadius: "6px", cursor: "pointer",
                              fontSize: "13px", fontFamily: "inherit",
                              border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                              background: isSelected ? "#eff6ff" : "#fff",
                              color: isSelected ? "#2563eb" : "#374151",
                              fontWeight: isSelected ? 600 : 400,
                              textAlign: "left" as const,
                            }}
                          >
                            <div style={{ fontSize: "10px", color: isSelected ? "#93c5fd" : "#9ca3af", marginBottom: "2px" }}>
                              {source}
                            </div>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
        )}

        {/* Merge button */}
        <button
          type="button"
          onClick={() => { void handleMerge(); }}
          disabled={merging || !allResolved}
          style={{
            padding: "12px 28px", borderRadius: "8px", border: "none",
            fontFamily: "inherit", fontSize: "14px", fontWeight: 600,
            cursor: merging || !allResolved ? "not-allowed" : "pointer",
            background: merging || !allResolved ? "#f1f3f7" : "#2563eb",
            color: merging || !allResolved ? "#9ca3af" : "#fff",
            transition: "background 0.15s",
          }}
        >
          {merging ? "Slår sammen…" : "Slå profiler sammen"}
        </button>
      </div>
    </>
  );
}
