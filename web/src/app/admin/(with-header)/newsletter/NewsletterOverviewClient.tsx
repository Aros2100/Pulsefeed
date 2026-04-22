"use client";

import Link from "next/link";

interface Edition {
  id: string;
  week_number: number;
  year: number;
  status: "draft" | "approved" | "sent";
  content: Record<string, unknown> | null;
  article_count: number;
  articlesBySubspecialty: Record<string, number>;
  globalCount: number;
  subspecialtiesWithArticles: string[];
  activeSubspecialtyCount: number;
}

interface Props {
  editions: Edition[];
}

// ISO week Saturday date
function weekSaturday(week: number, year: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  return saturday.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Step = "selection" | "review" | "intro-texts" | "preview";

interface StepState {
  selectionDone: boolean;
  reviewDone: boolean;
  introTextsDone: boolean;
  allDone: boolean;
  nextStep: Step;
}

function getStepState(edition: Edition): StepState {
  const content = edition.content ?? {};

  // Selection done: every active subspecialty has ≥ 5 articles
  const selectionDone =
    edition.activeSubspecialtyCount > 0 &&
    Object.keys(edition.articlesBySubspecialty).length >= edition.activeSubspecialtyCount &&
    Object.values(edition.articlesBySubspecialty).every((n) => n >= 5);

  // Review done: globalCount === 3
  const reviewDone = edition.globalCount === 3;

  // Intro texts done: global_intro filled AND all subspecialties with articles have a comment
  const globalIntro = typeof content.global_intro === "string" && content.global_intro.trim() !== "";
  const subspecialtyComments = (content.subspecialty_comments ?? {}) as Record<string, string>;
  const introDone =
    globalIntro &&
    edition.subspecialtiesWithArticles.length > 0 &&
    edition.subspecialtiesWithArticles.every(
      (s) => typeof subspecialtyComments[s] === "string" && subspecialtyComments[s].trim() !== ""
    );

  if (edition.status === "approved" || edition.status === "sent") {
    return { selectionDone: true, reviewDone: true, introTextsDone: true, allDone: true, nextStep: "preview" };
  }

  let nextStep: Step = "selection";
  if (selectionDone && reviewDone && introDone) nextStep = "preview";
  else if (selectionDone && reviewDone) nextStep = "intro-texts";
  else if (selectionDone) nextStep = "review";
  else nextStep = "selection";

  return {
    selectionDone,
    reviewDone,
    introTextsDone: introDone,
    allDone: false,
    nextStep,
  };
}

const STEPS: { key: Step | "send"; label: string }[] = [
  { key: "selection",   label: "Selection" },
  { key: "review",      label: "Review" },
  { key: "intro-texts", label: "Intro texts" },
  { key: "preview",     label: "Preview" },
  { key: "send",        label: "Send" },
];

function StatusBadge({ status }: { status: Edition["status"] }) {
  const map: Record<Edition["status"], { label: string; bg: string; color: string; border: string }> = {
    draft:    { label: "Draft",    bg: "#fefce8", color: "#854d0e", border: "#fef08a" },
    approved: { label: "Approved", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    sent:     { label: "Sent",     bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

function ProgressTracker({ edition }: { edition: Edition }) {
  const { selectionDone, reviewDone, introTextsDone, allDone, nextStep } = getStepState(edition);
  const sendDone = edition.status === "sent";

  const stepDone: Record<Step | "send", boolean> = {
    selection:     selectionDone,
    review:        reviewDone,
    "intro-texts": introTextsDone,
    preview:       allDone,
    send:          sendDone,
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STEPS.map((step) => {
        const done = stepDone[step.key as Step | "send"];
        const active = !sendDone && step.key === nextStep;

        const barColor = done ? "#1a1a1a" : active ? "#E83B2A" : "#e5e7eb";
        const labelColor = done ? "#1a1a1a" : active ? "#E83B2A" : "#9ca3af";

        return (
          <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 3, borderRadius: 2, background: barColor }} />
            <span style={{
              fontSize: "11px",
              fontWeight: active || done ? 600 : 400,
              color: labelColor,
              whiteSpace: "nowrap",
            }}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CurrentEditionCard({ edition }: { edition: Edition }) {
  const { allDone, nextStep } = getStepState(edition);
  const continueHref = `/admin/newsletter/${edition.id}/${nextStep}`;
  const continueLabel = STEPS.find((s) => s.key === nextStep)!.label + " →";

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      overflow: "hidden",
      marginBottom: 32,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
              Week {edition.week_number} · {edition.year}
            </div>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>
              {weekSaturday(edition.week_number, edition.year)}
            </div>
          </div>
          <StatusBadge status={edition.status} />
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: "24px 28px" }}>
        <ProgressTracker edition={edition} />
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 28px",
        background: "#f9fafb",
        borderTop: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "13px", color: "#6b7280" }}>
          {edition.article_count} article{edition.article_count !== 1 ? "s" : ""} selected
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/admin/newsletter/${edition.id}/preview`}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "1px solid #d1d5db",
              background: "transparent",
              fontSize: "13px",
              fontWeight: 600,
              color: "#374151",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Preview
          </Link>
          {!allDone && (
            <Link
              href={continueHref}
              style={{
                padding: "8px 16px",
                borderRadius: "7px",
                border: "none",
                background: "#1a1a1a",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {continueLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewsletterOverviewClient({ editions }: Props) {
  const current = editions[0] ?? null;
  const previous = editions.slice(1);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", marginBottom: 24, marginTop: 0 }}>
        Newsletter
      </h1>

      {current ? (
        <CurrentEditionCard edition={current} />
      ) : (
        <p style={{ fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>
          No editions found.
        </p>
      )}

      {previous.length > 0 && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", marginBottom: 12 }}>
            Previous editions
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            overflow: "hidden",
          }}>
            {previous.map((ed, i) => (
              <div
                key={ed.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 20px",
                  borderBottom: i < previous.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
                    Week {ed.week_number} · {ed.year}
                  </div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: 1 }}>
                    {weekSaturday(ed.week_number, ed.year)}
                  </div>
                </div>
                <span style={{ fontSize: "13px", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {ed.article_count} article{ed.article_count !== 1 ? "s" : ""}
                </span>
                <StatusBadge status={ed.status} />
                <Link
                  href={`/admin/newsletter/${ed.id}/preview`}
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#5a6a85",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Preview →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
