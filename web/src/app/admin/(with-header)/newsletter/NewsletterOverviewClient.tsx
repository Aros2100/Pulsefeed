"use client";

import Link from "next/link";

interface Edition {
  id: string;
  week_number: number;
  year: number;
  status: "draft" | "approved" | "sent";
  content: Record<string, unknown> | null;
  article_count: number;
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
  return saturday.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Step = "selection" | "review" | "intro-texts" | "preview";

function getProgress(edition: Edition): { activeStep: Step | null; allDone: boolean } {
  if (edition.status === "approved" || edition.status === "sent") {
    return { activeStep: null, allDone: true };
  }
  const hasArticles = edition.article_count > 0;
  const hasGlobalIntro = !!(edition.content as Record<string, unknown> | null)?.global_intro;
  if (!hasArticles) return { activeStep: "selection", allDone: false };
  if (!hasGlobalIntro) return { activeStep: "intro-texts", allDone: false };
  return { activeStep: "preview", allDone: false };
}

const STEPS: { key: Step; label: string }[] = [
  { key: "selection", label: "Selection" },
  { key: "review", label: "Review" },
  { key: "intro-texts", label: "Intro texts" },
  { key: "preview", label: "Preview" },
];

const STEP_ORDER: Step[] = ["selection", "review", "intro-texts", "preview"];

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
  const { activeStep, allDone } = getProgress(edition);
  const activeIdx = activeStep ? STEP_ORDER.indexOf(activeStep) : STEP_ORDER.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STEPS.map((step, i) => {
        const done = allDone || i < activeIdx;
        const active = !allDone && step.key === activeStep;
        const pending = !done && !active;

        let circleStyle: React.CSSProperties = {
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
          fontWeight: 700,
          flexShrink: 0,
          border: "2px solid",
        };
        if (done) {
          circleStyle = { ...circleStyle, background: "#15803d", borderColor: "#15803d", color: "#fff" };
        } else if (active) {
          circleStyle = { ...circleStyle, background: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" };
        } else {
          circleStyle = { ...circleStyle, background: "#fff", borderColor: "#d1d5db", color: "#9ca3af" };
        }

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={circleStyle}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: "11px",
                fontWeight: active ? 700 : 500,
                color: done ? "#15803d" : active ? "#1a1a1a" : "#9ca3af",
                whiteSpace: "nowrap",
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 48,
                height: 2,
                background: done ? "#15803d" : "#e5e7eb",
                marginBottom: 18,
                marginLeft: 4,
                marginRight: 4,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CurrentEditionCard({ edition }: { edition: Edition }) {
  const { activeStep, allDone } = getProgress(edition);
  const continueHref = activeStep
    ? `/admin/newsletter/${edition.id}/${activeStep}`
    : `/admin/newsletter/${edition.id}/preview`;

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
              Uge {edition.week_number}, {edition.year}
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
          {edition.article_count} artikel{edition.article_count !== 1 ? "er" : ""} valgt
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
              Fortsæt →
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
          Ingen aktuelle udgaver.
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
                    Uge {ed.week_number}, {ed.year}
                  </div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: 1 }}>
                    {weekSaturday(ed.week_number, ed.year)}
                  </div>
                </div>
                <span style={{ fontSize: "13px", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {ed.article_count} artikel{ed.article_count !== 1 ? "er" : ""}
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
