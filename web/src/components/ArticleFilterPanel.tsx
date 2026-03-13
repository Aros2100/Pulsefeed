"use client";

import { useState, useEffect, useRef } from "react";
import { DM_Sans, DM_Mono, Fraunces } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  display: "swap",
});

// ── Short labels for subspecialties ──────────────────────────────────────────

const SUB_SHORT_LABELS: Record<string, string> = {
  "Spine surgery": "Spine",
  "Neurosurgical oncology and Radiosurgery": "Oncology",
  "Vascular and Endovascular Neurosurgery": "Vascular",
  "Functional, pain and epilepsy surgery": "Functional",
  "Pediatric and foetal neurosurgery": "Pediatric",
  "Neurotraumatology": "Trauma",
  "Peripheral nerve surgery": "Peripheral nerve",
  "Skull base and pituitary surgery": "Skull base",
  "Craniofacial and reconstruction surgery": "Craniofacial",
  "Geriatric Neurosurgery": "Geriatric",
  "Hydrocephalus and CSF Disorders": "Hydrocephalus",
  "Neurointensive care and Neuroinfection": "Neurointensive",
  "Neurorehabilitation": "Neurorehab",
  "Surgical Technique and Technology": "Surgical Tech",
  "Basic and Translational Research": "Basic Research",
  "Ethics, Education and Socioeconomics": "Ethics/Education",
  "Digital Health, Robotics, and Innovation": "Digital Health",
};

// ── Evidence levels ──────────────────────────────────────────────────────────

const EVIDENCE_LEVELS = [
  { level: 5, label: "Meta/SR", color: "#c0392b" },
  { level: 4, label: "RCT", color: "#d35400" },
  { level: 3, label: "Prospective", color: "#e67e22" },
  { level: 2, label: "Retrospective", color: "#f39c12" },
  { level: 1, label: "Case/Op.", color: "#bdc3c7" },
] as const;

// ── Article types ────────────────────────────────────────────────────────────

const ARTICLE_TYPES = [
  "Original",
  "Syst. Review",
  "Meta-Analysis",
  "Case Report",
  "Review",
  "Editorial",
  "Letter",
  "Guideline",
  "Tech Note",
  "Trial",
] as const;

// ── Period ────────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "year";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

// ── Actionable ───────────────────────────────────────────────────────────────

type Actionable = "all" | "yes" | "no";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userSubspecialties: string[] | null;
  topSubspecialties: { tag: string; count: number }[];
  userRegion: string | null;
}

// ── AnimatedNumber ───────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{display.toLocaleString("en-US")}</>;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ArticleFilterPanel({ userSubspecialties, topSubspecialties, userRegion }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [minEvidence, setMinEvidence] = useState(1);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [actionable, setActionable] = useState<Actionable>("all");

  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (selectedSub) params.set("subspecialty", selectedSub);
    if (userRegion) params.set("region", userRegion);

    fetch(`/api/articles/count?${params}`)
      .then((r) => r.json())
      .then((data) => setCount((data as { count: number }).count ?? 0))
      .catch(() => setCount(0));
  }, [period, selectedSub, userRegion]);

  const hasFilters =
    selectedSub !== null ||
    minEvidence > 1 ||
    selectedTypes.length > 0 ||
    actionable !== "all";

  function reset() {
    setSelectedSub(null);
    setMinEvidence(1);
    setSelectedTypes([]);
    setActionable("all");
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function setEvidenceLevel(level: number) {
    setMinEvidence((prev) => (prev === level ? 1 : level));
  }

  // Scope buttons: "Neurosurgery" + user subspecialties or top from DB
  const displaySubs = userSubspecialties && userSubspecialties.length > 0
    ? userSubspecialties
    : topSubspecialties.slice(0, 3).map((s) => s.tag);

  const scopes = [
    { key: "all", label: "Neurosurgery" },
    ...displaySubs.map((s) => ({ key: s, label: SUB_SHORT_LABELS[s] ?? s })),
  ];

  return (
    <div className={dmSans.className} style={{ marginBottom: "12px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
            Explore articles
          </span>
          <span
            className={dmMono.className}
            style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}
          >
            Filter by your preferences
          </span>
          {userRegion && (
            <span style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#64748b",
              background: "#f1f5f9",
              borderRadius: "6px",
              padding: "3px 10px",
            }}>
              {userRegion}
            </span>
          )}
        </div>

        {/* Period toggle */}
        <div
          style={{
            display: "flex",
            gap: "2px",
            background: "#f1f5f9",
            borderRadius: "10px",
            padding: "3px",
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: period === p.key ? 600 : 400,
                color: period === p.key ? "#1e293b" : "#64748b",
                background: period === p.key ? "#fff" : "transparent",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: period === p.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {/* TOP: Article type pills */}
        <div
          style={{
            padding: "16px 24px 12px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "10px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#94a3b8",
              }}
            >
              Article type
            </span>
            {selectedTypes.length > 0 && (
              <span
                className={dmMono.className}
                style={{
                  fontSize: "10px",
                  color: "#c0392b",
                  fontWeight: 500,
                }}
              >
                {selectedTypes.length} selected
              </span>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, auto)",
              gap: "4px",
              justifyContent: "center",
              width: "fit-content",
              margin: "0 auto",
            }}
          >
            {ARTICLE_TYPES.map((type) => {
              const selected = selectedTypes.includes(type);
              const anySelected = selectedTypes.length > 0;
              let bg: string;
              let color: string;
              let shadow: string;
              if (!anySelected) {
                bg = "#f8fafc";
                color = "#64748b";
                shadow = "none";
              } else if (selected) {
                bg = "linear-gradient(135deg, #c0392b, #a93226)";
                color = "#fff";
                shadow = "0 2px 8px rgba(192, 57, 43, 0.35)";
              } else {
                bg = "#f8fafc";
                color = "#64748b";
                shadow = "none";
              }
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={{
                    padding: "6px 14px",
                    fontSize: "11.5px",
                    fontWeight: 500,
                    color,
                    background: bg,
                    boxShadow: shadow,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    minWidth: "110px",
                    textAlign: "center",
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* MIDDLE: Evidence | Center number | Subspecialties */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr 220px",
            minHeight: "220px",
          }}
        >
          {/* LEFT: Evidence levels */}
          <div
            style={{
              padding: "20px 20px",
              borderRight: "1px solid #f1f5f9",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#94a3b8",
                marginBottom: "12px",
              }}
            >
              Evidence level
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {EVIDENCE_LEVELS.map((ev) => {
                const isAboveMin = ev.level >= minEvidence;
                const isSelected = ev.level === minEvidence && minEvidence > 1;
                return (
                  <button
                    key={ev.level}
                    onClick={() => setEvidenceLevel(ev.level)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 10px",
                      border: isSelected ? `2px solid ${ev.color}` : "2px solid transparent",
                      borderRadius: "8px",
                      background: isAboveMin ? `${ev.color}12` : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "22px",
                        height: "22px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: isAboveMin ? ev.color : "#e2e8f0",
                        color: isAboveMin ? "#fff" : "#94a3b8",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {ev.level}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: isAboveMin ? 600 : 400,
                        color: isAboveMin ? "#1e293b" : "#94a3b8",
                        transition: "color 0.15s ease",
                      }}
                    >
                      {ev.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER: Big number */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
            }}
          >
            <div
              className={fraunces.className}
              style={{
                fontSize: "52px",
                fontWeight: 800,
                color: "#1e293b",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              <AnimatedNumber value={count} />
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                marginTop: "6px",
                fontWeight: 500,
              }}
            >
              articles
            </div>
            {hasFilters && (
              <button
                onClick={reset}
                style={{
                  marginTop: "12px",
                  fontSize: "12px",
                  color: "#c0392b",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontFamily: "inherit",
                  fontWeight: 500,
                  padding: 0,
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* RIGHT: Subspecialty scope buttons */}
          <div
            style={{
              borderLeft: "1px solid #f1f5f9",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "16px 20px",
              justifyContent: "center",
              minWidth: "220px",
            }}
          >
            {scopes.map((s) => {
              const isActive = s.key === "all" ? selectedSub === null : selectedSub === s.key;

              return (
                <button
                  key={s.key}
                  onClick={() => setSelectedSub(s.key === "all" ? null : s.key)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 500,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    ...(isActive
                      ? {
                          background: "linear-gradient(135deg, #c0392b, #a93226)",
                          color: "#fff",
                          boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)",
                        }
                      : {
                          background: "#f8fafc",
                          color: "#64748b",
                        }),
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f1f5f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f8fafc";
                    }
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM: Klinisk handlingsbar toggle */}
        <div
          style={{
            padding: "10px 24px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#94a3b8",
            }}
          >
            Vital significance:
          </span>
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: "#f1f5f9",
              borderRadius: "8px",
              padding: "2px",
            }}
          >
            {(
              [
                { key: "all", label: "All" },
                { key: "yes", label: "Yes" },
                { key: "no", label: "No" },
              ] as { key: Actionable; label: string }[]
            ).map((opt) => {
              const active = actionable === opt.key;
              const isYes = opt.key === "yes" && active;
              return (
                <button
                  key={opt.key}
                  onClick={() => setActionable(opt.key)}
                  style={{
                    padding: "4px 14px",
                    fontSize: "11px",
                    fontWeight: active ? 600 : 400,
                    color: isYes ? "#c0392b" : active ? "#1e293b" : "#64748b",
                    background: active ? "#fff" : "transparent",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
