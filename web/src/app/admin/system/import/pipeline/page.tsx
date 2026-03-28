"use client";

import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type GuardStatus = "ok" | "warn" | "missing";

interface Guard {
  status: GuardStatus;
  text: string;
}

interface Step {
  number: string;
  title: string;
  file: string;
  summary: GuardStatus;  // worst guard status in this step
  what: string;
  fields: string[];
  guards: Guard[];
  note?: { level: "red" | "yellow"; text: string };
}

// ── Data ──────────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    number: "1",
    title: "PubMed import",
    file: "importer.ts",
    summary: "ok",
    what: "ESearch henter PMIDs, EFetch henter XML. Artikel upsert'es i articles. Forfattere gemmes rå som JSONB i articles.authors. authors-tabellen røres ikke.",
    fields: ["articles.authors (rå JSONB)"],
    guards: [
      { status: "ok", text: "ON CONFLICT (pubmed_id) DO NOTHING" },
    ],
  },
  {
    number: "2",
    title: "Affiliationsparser",
    file: "importer.ts → resolveAuthorId → geoParseAffiliation",
    summary: "warn",
    what: "Affiliationstekst parses per forfatter. Match mod eksisterende authors på ORCID → navn+geo. Ny forfatter oprettes ved ingen match. Parser-geo er artikel-specifik.",
    fields: ["city", "country", "hospital", "geo_source = 'parser'", "verified_by = 'uverificeret'"],
    guards: [
      { status: "ok",      text: "isGeoUpgrade() på eksisterende forfattere" },
      { status: "warn",    text: "ingen guard på verified_by = 'human' i mergeAuthor()" },
    ],
  },
  {
    number: "3",
    title: "OpenAlex enrichment",
    file: "importer.ts → resolveAuthorFromOpenAlex",
    summary: "missing",
    what: "DOI-batch lookup mod OpenAlex i samme linking-runde som parser. Bruger authorship.institutions[0] (artikel-specifik institution). Fire paths: A) openalex_id match, B) ORCID match, C) navn+land match, D) fallback.",
    fields: ["city", "state", "country", "hospital", "department", "ror_id", "institution_type", "geo_source = 'openalex'", "verified_by = 'openalex'"],
    guards: [
      { status: "missing", text: "path B+C: ingen guard på geo_source = 'parser'" },
      { status: "missing", text: "path B+C: ingen guard på verified_by = 'human'" },
      { status: "warn",    text: "path D: har !== 'manual' guard men ikke 'parser'" },
    ],
    note: {
      level: "red",
      text: "J Alex Thomas-casen — parser sætter Wilmington korrekt → path B (ORCID match) → ROR geo for OpenAlex-institution overskriver med forkert by. geo_source og verified_by sættes til 'openalex'.",
    },
  },
  {
    number: "4",
    title: "ROR normalisering",
    file: "normalize-ror-geo.ts",
    summary: "missing",
    what: "Separat script, kører uafhængigt af linking. Itererer alle forfattere med ror_id IS NOT NULL. Overskriver geo med kanonisk data fra ROR API (locations[0].geonames_details).",
    fields: ["city", "state", "country (unconditional overwrite)"],
    guards: [
      { status: "missing", text: "ingen guard på geo_source = 'parser'" },
      { status: "missing", text: "ingen guard på verified_by = 'human'" },
      { status: "missing", text: "selekterer alle med ror_id IS NOT NULL inkl. forfattere med korrekt parser-geo" },
    ],
    note: {
      level: "yellow",
      text: "Kan nulstille parser-geo for alle forfattere med ror_id — uanset om linking kørte korrekt.",
    },
  },
  {
    number: "5",
    title: "Artikel geo-felter",
    file: "author-linker.ts",
    summary: "ok",
    what: "Artikel-tabellens geo-felter populeres fra first/last author efter linking. Downstream af alle foregående trin.",
    fields: [
      "geo_country", "geo_city", "geo_institution",
      "geo_department", "geo_region", "geo_continent",
    ],
    guards: [
      { status: "ok", text: "ingen selvstændigt problem — afhængig af upstream kvalitet" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const GUARD_COLORS: Record<GuardStatus, { bg: string; text: string; label: string }> = {
  ok:      { bg: "#dcfce7", text: "#15803d", label: "OK" },
  warn:    { bg: "#fef9c3", text: "#a16207", label: "Advarsel" },
  missing: { bg: "#fee2e2", text: "#b91c1c", label: "Mangler" },
};

function worstStatus(guards: Guard[]): GuardStatus {
  if (guards.some(g => g.status === "missing")) return "missing";
  if (guards.some(g => g.status === "warn"))    return "warn";
  return "ok";
}

function GuardBadge({ status }: { status: GuardStatus }) {
  const c = GUARD_COLORS[status];
  return (
    <span style={{
      fontSize: "11px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px",
      background: c.bg, color: c.text,
    }}>
      {c.label}
    </span>
  );
}

function GuardRow({ guard }: { guard: Guard }) {
  const icon = guard.status === "ok" ? "✓" : guard.status === "warn" ? "!" : "✗";
  const color = GUARD_COLORS[guard.status].text;
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "4px" }}>
      <span style={{ color, fontWeight: 700, fontSize: "13px", flexShrink: 0, width: "14px" }}>{icon}</span>
      <span style={{ fontSize: "13px", color: "#374151" }}>{guard.text}</span>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepCard({ step, open, onToggle }: { step: Step; open: boolean; onToggle: () => void }) {
  const c = GUARD_COLORS[step.summary];
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "14px",
          padding: "16px 20px", background: "#EEF2F7",
          borderTop: "none", borderLeft: "none", borderRight: "none",
          borderBottom: open ? "1px solid #dde3ed" : "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        {/* Circle */}
        <span style={{
          width: "28px", height: "28px", borderRadius: "50%",
          background: "#E83B2A", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700, flexShrink: 0,
        }}>
          {step.number}
        </span>
        {/* Titles */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>{step.title}</div>
          <div style={{ fontSize: "11px", color: "#5a6a85", marginTop: "2px", fontFamily: "monospace" }}>{step.file}</div>
        </div>
        <GuardBadge status={step.summary} />
        <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "8px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: "20px" }}>
          {/* What */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
              Hvad sker her
            </div>
            <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.6 }}>{step.what}</div>
          </div>

          {/* Fields */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              Felter der skrives
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {step.fields.map(f => (
                <code key={f} style={{
                  fontSize: "12px", padding: "2px 8px", borderRadius: "4px",
                  background: "#f1f5f9", border: "1px solid #e2e8f0", fontFamily: "monospace",
                }}>
                  {f}
                </code>
              ))}
            </div>
          </div>

          {/* Guards */}
          <div style={{ marginBottom: step.note ? "16px" : 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              Guards
            </div>
            {step.guards.map((g, i) => <GuardRow key={i} guard={g} />)}
          </div>

          {/* Note */}
          {step.note && (
            <div style={{
              marginTop: "16px", padding: "12px 14px", borderRadius: "8px",
              background: step.note.level === "red" ? "#fee2e2" : "#fef9c3",
              borderLeft: `3px solid ${step.note.level === "red" ? "#b91c1c" : "#a16207"}`,
            }}>
              <div style={{
                fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
                color: step.note.level === "red" ? "#b91c1c" : "#a16207", marginBottom: "4px",
              }}>
                Note
              </div>
              <div style={{ fontSize: "13px", color: step.note.level === "red" ? "#7f1d1d" : "#713f12", lineHeight: 1.6 }}>
                {step.note.text}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});

  function toggle(num: string) {
    setOpenSteps(prev => ({ ...prev, [num]: !prev[num] }));
  }

  function expandAll()  { setOpenSteps(Object.fromEntries(STEPS.map(s => [s.number, true]))); }
  function collapseAll(){ setOpenSteps({}); }

  const totalGuards   = STEPS.flatMap(s => s.guards).length;
  const okCount       = STEPS.flatMap(s => s.guards).filter(g => g.status === "ok").length;
  const warnCount     = STEPS.flatMap(s => s.guards).filter(g => g.status === "warn").length;
  const missingCount  = STEPS.flatMap(s => s.guards).filter(g => g.status === "missing").length;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/import" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>← Import</Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Import · Pipeline
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px" }}>Geo-enrichment pipeline</h1>
          <p style={{ fontSize: "14px", color: "#5a6a85", margin: 0, lineHeight: 1.6 }}>
            Fra PubMed import til artikel-geo — rækkefølge, felter og guards for hvert trin.
          </p>
        </div>

        {/* Status bar */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "14px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#5a6a85" }}>{totalGuards} guards total</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#15803d" }}>✓ {okCount} OK</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#a16207" }}>! {warnCount} advarsel</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#b91c1c" }}>✗ {missingCount} mangler</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={expandAll}
              style={{
                fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                border: "1px solid #dde3ed", borderRadius: "6px",
                background: "#fff", color: "#5a6a85", cursor: "pointer",
              }}
            >
              Udvid alle
            </button>
            <button
              onClick={collapseAll}
              style={{
                fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                border: "1px solid #dde3ed", borderRadius: "6px",
                background: "#fff", color: "#5a6a85", cursor: "pointer",
              }}
            >
              Fold alle
            </button>
          </div>
        </div>

        {/* Steps with vertical connector */}
        <div style={{ position: "relative" }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute",
            left: "33px",
            top: "28px",
            bottom: "28px",
            width: "2px",
            background: "#dde3ed",
            zIndex: 0,
          }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "relative", zIndex: 1 }}>
            {STEPS.map(step => (
              <StepCard
                key={step.number}
                step={step}
                open={!!openSteps[step.number]}
                onToggle={() => toggle(step.number)}
              />
            ))}
          </div>
        </div>

        {/* Footer solution box */}
        <div style={{
          marginTop: "32px",
          padding: "16px 20px",
          borderRadius: "10px",
          background: "#f8f9fb",
          border: "1px solid #dde3ed",
        }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#5a6a85", marginBottom: "8px" }}>
            Anbefalet løsning
          </div>
          <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7 }}>
            <strong>Løsning A (anbefalet):</strong> Tilføj guard i path B og C i{" "}
            <code style={{ fontSize: "12px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", fontFamily: "monospace" }}>
              resolveAuthorFromOpenAlex
            </code>
            : skip geo-overskrivning hvis{" "}
            <code style={{ fontSize: "12px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", fontFamily: "monospace" }}>
              geo_source = &apos;parser&apos;
            </code>{" "}
            og{" "}
            <code style={{ fontSize: "12px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", fontFamily: "monospace" }}>
              country IS NOT NULL
            </code>
            . Tilsvarende guard i{" "}
            <code style={{ fontSize: "12px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", fontFamily: "monospace" }}>
              normalize-ror-geo.ts
            </code>
            . Begge steder:{" "}
            <code style={{ fontSize: "12px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", fontFamily: "monospace" }}>
              verified_by = &apos;human&apos;
            </code>{" "}
            må aldrig overskrives.
          </div>
        </div>

      </div>
    </div>
  );
}
