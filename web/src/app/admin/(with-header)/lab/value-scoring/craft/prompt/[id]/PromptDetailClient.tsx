"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PromptStatus } from "@/lib/lab/value-scoring/prompt-versions";

interface Props {
  promptId:    string;
  initialText: string;
  initialNotes: string;
  editable:    boolean;
  status:      PromptStatus;
  scoredCount: number;
  articleCount: number;
  hasParent:   boolean;
}

type ScoreSummary = {
  total:        number;
  succeeded:    number;
  failed:       number;
  durationMs:   number;
  promptVersion: number;
};

export default function PromptDetailClient({
  promptId, initialText, initialNotes, editable, status, scoredCount, articleCount, hasParent,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [notes, setNotes] = useState(initialNotes);
  const [savedText, setSavedText] = useState(initialText);
  const [savedNotes, setSavedNotes] = useState(initialNotes);

  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState<null | "quick" | "full" | "advanced" | "disagreements">(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scoringModel, setScoringModel] = useState("claude-haiku-4-5-20251001");
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = text !== savedText || notes !== savedNotes;
  const remaining = Math.max(0, articleCount - scoredCount);
  const fullyScored = status === "scored";

  async function save() {
    setSavingState("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/prompt/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId, promptText: text, changeNotes: notes }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Save failed");
        setSavingState("idle");
        return;
      }
      setSavedText(text);
      setSavedNotes(notes);
      setSavingState("saved");
      router.refresh();
      setTimeout(() => setSavingState("idle"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSavingState("idle");
    }
  }

  async function runScore(action: "quick" | "full" | "advanced" | "disagreements") {
    if (dirty) {
      setError("Save changes before scoring.");
      return;
    }
    setBusy(action);
    setError(null);
    setSummary(null);
    try {
      let url: string;
      const body: Record<string, unknown> = { promptId };
      switch (action) {
        case "quick":
          url = "/api/admin/lab/value-scoring/craft/prompt/score-quick";
          body.model = scoringModel;
          break;
        case "disagreements":
          url = "/api/admin/lab/value-scoring/craft/prompt/score-disagreements";
          break;
        case "advanced":
          url = "/api/admin/lab/value-scoring/craft/prompt/score-full";
          body.force = true;
          break;
        case "full":
        default:
          url = "/api/admin/lab/value-scoring/craft/prompt/score-full";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Scoring failed");
      } else {
        setSummary(json.summary as ScoreSummary);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px" }}>
          Prompt text {!editable && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#94a3b8" }}>· read-only (already scored)</span>}
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          readOnly={!editable}
          style={{
            width: "100%", minHeight: "320px", padding: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px",
            resize: "vertical",
            color: editable ? "#1a1a1a" : "#5a6a85",
            background: editable ? "#fff" : "#fafbfc",
          }}
        />
      </div>

      <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px" }}>
          Change notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          readOnly={!editable}
          placeholder={editable ? "What changed compared to the previous version?" : ""}
          style={{
            width: "100%", minHeight: "70px", padding: "10px",
            fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px",
            resize: "vertical",
            color: editable ? "#1a1a1a" : "#5a6a85",
            background: editable ? "#fff" : "#fafbfc",
          }}
        />
      </div>

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "#166534" }}>
          Scored {summary.succeeded}/{summary.total} articles ·
          {summary.failed > 0 && <> {summary.failed} failed to parse · </>}
          {(summary.durationMs / 1000).toFixed(1)}s
        </div>
      )}

      {/* Model selector — only shown before quick test is run */}
      {status === "draft" && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", whiteSpace: "nowrap" }}>
            Scoring model
          </label>
          <select
            value={scoringModel}
            onChange={e => setScoringModel(e.target.value)}
            style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px",
              padding: "6px 10px", fontSize: "13px", color: "#1a1a1a",
            }}
          >
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 (default — fastest)</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6 (better calibration)</option>
            <option value="claude-opus-4-7">Opus 4.7 (best calibration)</option>
          </select>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          {editable && savingState === "saved" && "Saved."}
          {editable && dirty && "Unsaved changes."}
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {editable && (
            <button
              onClick={save}
              disabled={!dirty || savingState === "saving"}
              style={{
                background: !dirty || savingState === "saving" ? "#e5e7eb" : "#1a1a1a",
                color: !dirty || savingState === "saving" ? "#94a3b8" : "#fff",
                border: "none", borderRadius: "6px",
                padding: "10px 16px", fontSize: "13px", fontWeight: 600,
                cursor: !dirty || savingState === "saving" ? "default" : "pointer",
              }}
            >
              {savingState === "saving" ? "Saving…" : "Save"}
            </button>
          )}

          {status === "draft" && !hasParent && (
            <>
              {showAdvanced ? (
                <button
                  onClick={() => runScore("advanced")}
                  disabled={busy !== null || dirty}
                  title={dirty ? "Save changes first" : "Skip quick test and score all 100 articles"}
                  style={btnSecondary(busy !== null || dirty)}
                >
                  {busy === "advanced" ? "Scoring…" : `Score all ${articleCount} articles`}
                </button>
              ) : (
                <button
                  onClick={() => setShowAdvanced(true)}
                  disabled={busy !== null}
                  style={{ fontSize: "12px", color: "#94a3b8", background: "none", border: "none", padding: "10px 8px", cursor: "pointer", textDecoration: "underline" }}
                >
                  Advanced
                </button>
              )}
              <button
                onClick={() => runScore("quick")}
                disabled={busy !== null || dirty}
                title={dirty ? "Save changes first" : ""}
                style={btnPrimary(busy !== null || dirty)}
              >
                {busy === "quick" ? "Running quick test…" : "Quick test (15 articles)"}
              </button>
            </>
          )}

          {status === "draft" && hasParent && (
            <>
              {showAdvanced ? (
                <button
                  onClick={() => runScore("advanced")}
                  disabled={busy !== null || dirty}
                  title={dirty ? "Save changes first" : "Re-score all 100 articles for final validation"}
                  style={btnSecondary(busy !== null || dirty)}
                >
                  {busy === "advanced" ? "Scoring…" : `Score all ${articleCount} articles`}
                </button>
              ) : (
                <button
                  onClick={() => setShowAdvanced(true)}
                  disabled={busy !== null}
                  style={{ fontSize: "12px", color: "#94a3b8", background: "none", border: "none", padding: "10px 8px", cursor: "pointer", textDecoration: "underline" }}
                >
                  Advanced
                </button>
              )}
              <button
                onClick={() => runScore("disagreements")}
                disabled={busy !== null || dirty}
                title={dirty ? "Save changes first" : "Score only the articles involved in the parent version's disagreements"}
                style={btnPrimary(busy !== null || dirty)}
              >
                {busy === "disagreements" ? "Scoring…" : "Score disagreement articles only"}
              </button>
            </>
          )}

          {status === "quick_tested" && (
            <>
              <Link
                href={`/admin/lab/value-scoring/craft/prompt/new?from=${promptId}`}
                style={{
                  fontSize: "13px", color: "#94a3b8", textDecoration: "none",
                  padding: "10px 14px", borderRadius: "6px", border: "1px solid #e5e7eb",
                }}
              >
                Discard and create new version
              </Link>
              <button
                onClick={() => runScore("full")}
                disabled={busy !== null}
                style={btnPrimary(busy !== null)}
              >
                {busy === "full" ? "Scoring…" : `Score remaining ${remaining} articles`}
              </button>
            </>
          )}

          {status === "scoring" && (
            <button
              onClick={() => runScore("full")}
              disabled={busy !== null}
              style={btnPrimary(busy !== null)}
            >
              {busy === "full" ? "Scoring…" : `Score remaining ${remaining} articles`}
            </button>
          )}

          {fullyScored && (
            <Link
              href={`/admin/lab/value-scoring/craft/evaluation?promptId=${promptId}`}
              style={{
                background: "#E83B2A", color: "#fff",
                border: "none", borderRadius: "6px",
                padding: "10px 18px", fontSize: "13px", fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Open evaluation →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "#fda99e" : "#E83B2A",
    color: "#fff",
    border: "none", borderRadius: "6px",
    padding: "10px 18px", fontSize: "13px", fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "#e5e7eb" : "#fff",
    color: disabled ? "#94a3b8" : "#1a1a1a",
    border: "1px solid #e5e7eb", borderRadius: "6px",
    padding: "10px 16px", fontSize: "13px", fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}
