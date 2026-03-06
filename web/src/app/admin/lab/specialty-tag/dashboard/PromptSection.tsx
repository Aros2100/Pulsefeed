"use client";

import { useEffect, useState } from "react";

export interface ModelVersion {
  id: string;
  version: string;
  prompt: string;
  notes: string | null;
  activated_at: string;
  deactivated_at: string | null;
  active: boolean;
  accuracy: number | null;
  validatedCount: number;
  generated_by: string; // 'auto' | 'manual'
}

interface Props {
  versions: ModelVersion[];
  specialty: string;
  module: string;
  totalDecisions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

function AccuracyLine({ accuracy, count }: { accuracy: number | null; count: number }) {
  if (count === 0) return <span style={{ fontSize: "12px", color: "#aaa" }}>Ingen data endnu</span>;
  const color = accuracy == null ? "#888" : accuracy >= 80 ? "#15803d" : accuracy >= 60 ? "#d97706" : "#dc2626";
  return (
    <span style={{ fontSize: "12px", color }}>
      <span style={{ fontWeight: 700 }}>{accuracy ?? "—"}% nøjagtighed</span>
      <span style={{ color: "#aaa", fontWeight: 400 }}> · {count} artikler valideret</span>
    </span>
  );
}

function GeneratedBadge({ by }: { by: string }) {
  const isAuto = by === "auto";
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "1px 7px",
      background: isAuto ? "#dbeafe" : "#f0f2f5",
      color: isAuto ? "#1d4ed8" : "#5a6a85",
      textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
    }}>
      {isAuto ? "Auto-genereret" : "Manuelt oprettet"}
    </span>
  );
}

const codeStyle: React.CSSProperties = {
  background: "#f8f9fb", border: "1px solid #e8ecf1", borderRadius: "8px",
  padding: "14px 16px", fontSize: "12px", lineHeight: 1.7, color: "#2a2a2a",
  whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: "28px", right: "28px", zIndex: 3000,
      background: "#1a1a1a", color: "#fff", borderRadius: "8px",
      padding: "12px 20px", fontSize: "13px", fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      animation: "fadeInUp 0.2s ease",
    }}>
      {message}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromptSection({ versions, specialty, module, totalDecisions }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId]     = useState<string | null>(null);
  const [activating, setActivating]   = useState(false);
  const [toast, setToast]             = useState<string | null>(null);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editNotes, setEditNotes]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState<string | null>(null);

  const activeVersion   = versions.find((v) => v.active) ?? null;
  const historyVersions = versions.filter((v) => !v.active);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleActivate(v: ModelVersion) {
    setActivating(true);
    try {
      const res = await fetch("/api/lab/activate-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, specialty, module }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) { setActivating(false); return; }
      setConfirmId(null);
      setToast(`${v.version} er nu aktiv`);
      // Reload after toast is visible
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setActivating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/lab/model-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, module, prompt: editPrompt, notes: editNotes || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) { setSaveErr(data.error ?? "Fejl"); setSaving(false); return; }
      window.location.reload();
    } catch {
      setSaveErr("Netværksfejl");
      setSaving(false);
    }
  }

  function isBetter(v: ModelVersion): boolean {
    if (v.accuracy == null) return false;
    if (activeVersion?.accuracy == null) return true;
    return v.accuracy > activeVersion.accuracy;
  }

  const hasSufficientData = totalDecisions >= 100;

  // ── Styles ────────────────────────────────────────────────────────────────

  const sectionLabel: React.CSSProperties = {
    fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
    textTransform: "uppercase", fontWeight: 700,
  };

  return (
    <>
      {/* ── Section heading ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={sectionLabel}>Prompt Evolution</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#888" }}>Step 2 — add improved version</span>
          {hasSufficientData ? (
            <button
              onClick={() => { setEditPrompt(""); setEditNotes(""); setSaveErr(null); setModalOpen(true); }}
              style={{ fontSize: "12px", fontWeight: 700, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", padding: "5px 13px", cursor: "pointer" }}
            >
              + Tilføj ny version
            </button>
          ) : (
            <span
              title={`Need at least 100 decisions first (${totalDecisions} so far)`}
              style={{ fontSize: "12px", fontWeight: 700, background: "#e2e8f0", color: "#94a3b8", borderRadius: "6px", padding: "5px 13px", cursor: "not-allowed" }}
            >
              + Tilføj ny version
            </span>
          )}
        </div>
      </div>
      {!hasSufficientData && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "9px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#dc2626", flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: "12px", color: "#b91c1c" }}>
            Need at least 100 validated decisions before optimizing the prompt ({totalDecisions} so far)
          </span>
        </div>
      )}
      <p style={{ fontSize: "12px", color: "#888", margin: "0 0 14px" }}>
        Prompten kan opdateres, når en ny version har opnået højere nøjagtighed end den nuværende aktive — målt på validerede artikler i The Lab.
      </p>

      {versions.length === 0 && (
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "24px", fontSize: "13px", color: "#aaa", marginBottom: "16px" }}>
          Ingen prompt-versioner endnu.
        </div>
      )}

      {/* ── Active version card ── */}
      {activeVersion && (
        <div style={{
          background: "#fff", borderRadius: "10px", marginBottom: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          borderLeft: "3px solid #15803d", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "10px 20px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#15803d", color: "#fff", borderRadius: "4px", padding: "1px 8px" }}>Aktiv</span>
            <span style={{ fontSize: "13px", fontWeight: 700, background: "#EEF2F7", border: "1px solid #dde3ed", borderRadius: "4px", padding: "1px 10px" }}>
              {activeVersion.version}
            </span>
            <span style={{ fontSize: "12px", color: "#5a6a85" }}>Aktiveret {fmtDate(activeVersion.activated_at)}</span>
            <GeneratedBadge by={activeVersion.generated_by} />
            <span style={{ flex: 1 }} />
            <AccuracyLine accuracy={activeVersion.accuracy} count={activeVersion.validatedCount} />
          </div>

          {/* Body */}
          <div style={{ padding: "14px 20px" }}>
            {activeVersion.notes && (
              <div style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "10px", fontStyle: "italic" }}>
                {activeVersion.notes}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                onClick={() => toggleExpand(activeVersion.id)}
                style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", borderRadius: "5px", padding: "4px 10px", cursor: "pointer" }}
              >
                {expandedIds.has(activeVersion.id) ? "Skjul prompt ▲" : "Se prompt ▼"}
              </button>
              <button
                disabled
                style={{ fontSize: "12px", fontWeight: 600, background: "#f0f2f5", color: "#aaa", border: "none", borderRadius: "6px", padding: "5px 12px", cursor: "not-allowed" }}
              >
                Sæt som aktiv
              </button>
            </div>
            {expandedIds.has(activeVersion.id) && (
              <pre style={{ ...codeStyle, marginTop: "12px" }}>{activeVersion.prompt}</pre>
            )}
          </div>
        </div>
      )}

      {/* ── History versions ── */}
      {historyVersions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {historyVersions.map((v) => {
            const better = isBetter(v);
            const isConfirming = confirmId === v.id;
            return (
              <div key={v.id} style={{
                background: "#fff", borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
                overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", borderBottom: expandedIds.has(v.id) || isConfirming ? "1px solid #f0f2f5" : "none" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, background: "#f0f2f5", borderRadius: "3px", padding: "1px 7px", flexShrink: 0 }}>
                    {v.version}
                  </span>
                  <span style={{ fontSize: "12px", color: "#888", flexShrink: 0 }}>
                    {fmtDate(v.activated_at)}
                    {v.deactivated_at && <> → {fmtDate(v.deactivated_at)}</>}
                  </span>
                  <GeneratedBadge by={v.generated_by} />
                  {v.notes && (
                    <span style={{ fontSize: "12px", color: "#5a6a85", fontStyle: "italic", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.notes}
                    </span>
                  )}
                  {!v.notes && <span style={{ flex: 1 }} />}
                  <AccuracyLine accuracy={v.accuracy} count={v.validatedCount} />
                  <button
                    onClick={() => toggleExpand(v.id)}
                    style={{ fontSize: "11px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", flexShrink: 0 }}
                  >
                    {expandedIds.has(v.id) ? "Skjul ▲" : "Se prompt ▼"}
                  </button>
                  {better && (
                    <button
                      onClick={() => setConfirmId(isConfirming ? null : v.id)}
                      style={{
                        fontSize: "11px", fontWeight: 700, background: "#1a1a1a", color: "#fff",
                        border: "none", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      Sæt som aktiv
                    </button>
                  )}
                </div>

                {/* Inline confirm */}
                {isConfirming && (
                  <div style={{ padding: "12px 16px", background: "#fffbeb", borderBottom: expandedIds.has(v.id) ? "1px solid #f0f2f5" : "none" }}>
                    <div style={{ fontSize: "13px", color: "#1a1a1a", marginBottom: "10px" }}>
                      Er du sikker?{" "}
                      <strong>{v.version}</strong> scorer bedre ({v.accuracy}%) end nuværende{" "}
                      <strong>{activeVersion?.version}</strong>
                      {activeVersion?.accuracy != null && <> ({activeVersion.accuracy}%)</>}.
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => void handleActivate(v)}
                        disabled={activating}
                        style={{
                          fontSize: "12px", fontWeight: 700,
                          background: activating ? "#f0f2f5" : "#15803d",
                          color: activating ? "#aaa" : "#fff",
                          border: "none", borderRadius: "6px", padding: "6px 14px",
                          cursor: activating ? "not-allowed" : "pointer",
                        }}
                      >
                        {activating ? "Aktiverer…" : `Ja, aktiver ${v.version}`}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={activating}
                        style={{ fontSize: "12px", background: "none", border: "1px solid #dde3ed", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", color: "#5a6a85" }}
                      >
                        Annuller
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded prompt */}
                {expandedIds.has(v.id) && (
                  <div style={{ padding: "14px 16px" }}>
                    <pre style={{ ...codeStyle, fontSize: "11px" }}>{v.prompt}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add new version modal ── */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", padding: "28px 32px", width: "620px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", fontFamily: "var(--font-inter), Inter, sans-serif" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, marginBottom: "4px" }}>Tilføj ny version</div>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "20px" }}>
              Gemmes uden at blive aktiveret — klik "Sæt som aktiv" bagefter for at tage den i brug.
            </div>

            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "6px" }}>Prompt</label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={14}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: "1px solid #dde3ed", borderRadius: "8px", fontFamily: "ui-monospace, 'Cascadia Code', monospace", fontSize: "12px", lineHeight: 1.7, resize: "vertical", background: "#f8f9fb", marginBottom: "16px" }}
            />

            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "6px" }}>Hvad ændrede du?</label>
            <input
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="f.eks. Skærpet kriterierne for spinalkirurgi"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #dde3ed", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}
            />

            {saveErr && <div style={{ fontSize: "12px", color: "#dc2626", marginBottom: "12px" }}>{saveErr}</div>}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #dde3ed", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Annuller
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || editPrompt.trim().length < 10}
                style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: saving || editPrompt.trim().length < 10 ? "#e2e8f0" : "#E83B2A", color: saving || editPrompt.trim().length < 10 ? "#94a3b8" : "#fff", fontSize: "13px", fontWeight: 700, cursor: saving || editPrompt.trim().length < 10 ? "not-allowed" : "pointer" }}
              >
                {saving ? "Gemmer…" : "Gem som ny version"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
