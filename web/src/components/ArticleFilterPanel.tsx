"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

// ── User subspecialties ──────────────────────────────────────────────────────

// TODO: Hent fra user_subspecialties tabel når den eksisterer
const USER_SUBSPECIALTIES = [
  "Spine surgery",
  "Neurosurgical oncology and Radiosurgery",
  "Vascular and Endovascular Neurosurgery",
];

const SUB_LABELS: Record<string, string> = {
  "Spine surgery": "Spine",
  "Neurosurgical oncology and Radiosurgery": "Onkologi",
  "Vascular and Endovascular Neurosurgery": "Vaskulær",
};

// ── Evidence levels ──────────────────────────────────────────────────────────

const EVIDENCE_LEVELS = [
  { level: 5, label: "Meta/SR", color: "#c0392b" },
  { level: 4, label: "RCT", color: "#d35400" },
  { level: 3, label: "Prospektiv", color: "#e67e22" },
  { level: 2, label: "Retrospektiv", color: "#f39c12" },
  { level: 1, label: "Case/Op.", color: "#bdc3c7" },
] as const;

// ── Article types ────────────────────────────────────────────────────────────

const ARTICLE_TYPES = [
  "Original",
  "Syst. Review",
  "Meta-Analyse",
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
  { key: "week", label: "Uge" },
  { key: "month", label: "Måned" },
  { key: "year", label: "År" },
];

// ── Actionable ───────────────────────────────────────────────────────────────

type Actionable = "all" | "yes" | "no";

// ── Dummy count computation ──────────────────────────────────────────────────

// TODO: Erstat dummy-beregning med API-kald når classification pipeline kører
function computeCount(
  period: Period,
  sub: string | null,
  minEvidence: number,
  types: string[],
  actionable: Actionable,
): number {
  const base: Record<Period, number> = { week: 487, month: 2838, year: 2838 };
  let c = base[period] || 487;
  if (sub !== null) c = Math.round(c * (1 / 17) * 1.2);
  const evPct: Record<number, number> = { 1: 1, 2: 0.78, 3: 0.39, 4: 0.21, 5: 0.13 };
  c = Math.round(c * (evPct[minEvidence] || 1));
  if (types.length > 0 && types.length < 10) c = Math.round(c * (types.length / 10));
  if (actionable === "yes") c = Math.round(c * 0.15);
  if (actionable === "no") c = Math.round(c * 0.85);
  return Math.max(0, c);
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

  return <>{display.toLocaleString("da-DK")}</>;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ArticleFilterPanel() {
  const [period, setPeriod] = useState<Period>("week");
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [minEvidence, setMinEvidence] = useState(1);
  const [activeTypes, setActiveTypes] = useState<string[]>([...ARTICLE_TYPES]);
  const [actionable, setActionable] = useState<Actionable>("all");

  const count = useMemo(
    () => computeCount(period, selectedSub, minEvidence, activeTypes, actionable),
    [period, selectedSub, minEvidence, activeTypes, actionable],
  );

  const hasFilters =
    selectedSub !== null ||
    minEvidence > 1 ||
    activeTypes.length < ARTICLE_TYPES.length ||
    actionable !== "all";

  function reset() {
    setSelectedSub(null);
    setMinEvidence(1);
    setActiveTypes([...ARTICLE_TYPES]);
    setActionable("all");
  }

  function toggleType(type: string) {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function setEvidenceLevel(level: number) {
    setMinEvidence((prev) => (prev === level ? 1 : level));
  }

  // Scope buttons: "Neurokirurgi" + user subspecialties
  const scopes = [
    { key: "all", label: "Neurokirurgi" },
    ...USER_SUBSPECIALTIES.map((s) => ({ key: s, label: SUB_LABELS[s] ?? s })),
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
            Udforsk artikler
          </span>
          <span
            className={dmMono.className}
            style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}
          >
            Filtrér efter dine præferencer
          </span>
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
              Artikeltype
            </span>
            <span
              className={dmMono.className}
              style={{
                fontSize: "10px",
                color: activeTypes.length < ARTICLE_TYPES.length ? "#c0392b" : "#94a3b8",
                fontWeight: 500,
              }}
            >
              {activeTypes.length}/{ARTICLE_TYPES.length}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              justifyContent: "center",
            }}
          >
            {ARTICLE_TYPES.map((type) => {
              const active = activeTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "10.5px",
                    fontWeight: active ? 600 : 500,
                    color: active ? "#fff" : "#64748b",
                    background: active ? "#2c3e50" : "#f1f5f9",
                    border: "none",
                    borderRadius: "999px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
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
              Evidensniveau
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
                fontSize: "64px",
                fontWeight: 900,
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
              artikler
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
                Nulstil
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
              const isAll = s.key === "all";
              const activeStyle = isAll
                ? {
                    background: "linear-gradient(135deg, #c0392b, #a93226)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)",
                  }
                : {
                    background: "linear-gradient(135deg, #2c3e50, #34495e)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(44, 62, 80, 0.3)",
                  };

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
                      ? activeStyle
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
            padding: "12px 24px 16px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
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
            Klinisk handlingsbar
          </span>
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: "#f1f5f9",
              borderRadius: "10px",
              padding: "3px",
            }}
          >
            {(
              [
                { key: "all", label: "Alle" },
                { key: "yes", label: "Ja" },
                { key: "no", label: "Nej" },
              ] as { key: Actionable; label: string }[]
            ).map((opt) => {
              const active = actionable === opt.key;
              const isYes = opt.key === "yes" && active;
              return (
                <button
                  key={opt.key}
                  onClick={() => setActionable(opt.key)}
                  style={{
                    padding: "5px 20px",
                    fontSize: "12px",
                    fontWeight: active ? 600 : 400,
                    color: isYes ? "#c0392b" : active ? "#1e293b" : "#64748b",
                    background: active ? "#fff" : "transparent",
                    border: "none",
                    borderRadius: "8px",
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
