"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DM_Sans, DM_Mono } from "next/font/google";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";

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

// Normalize a stored subspecialty string to the canonical SUBSPECIALTY_OPTIONS entry.
// Handles legacy formats like "Functional, pain and epilepsy surgery" → "Functional Pain and Epilepsy Surgery"
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[,]/g, "").replace(/\s+/g, " ").trim();
}

const CANONICAL_MAP: Record<string, string> = Object.fromEntries(
  SUBSPECIALTY_OPTIONS.map((opt) => [normalizeKey(opt), opt]),
);

function toCanonical(stored: string): string | null {
  // 1. Direct case-insensitive match — canonical names pass through unchanged.
  const trimmed = stored.trim();
  const direct = SUBSPECIALTY_OPTIONS.find(
    (o) => o.toLowerCase() === trimmed.toLowerCase(),
  );
  if (direct) return direct;
  // 2. Legacy comma-format fallback ("Functional, pain and epilepsy surgery").
  return CANONICAL_MAP[normalizeKey(stored)] ?? null;
}

const CLINICAL_STOPLIST = new Set([
  "humans", "male", "female", "middle aged", "adult", "aged",
  "aged, 80 and over", "young adult", "adolescent", "child",
  "child, preschool", "infant", "infant, newborn", "animals",
  "retrospective studies", "prospective studies", "follow-up studies",
  "cohort studies", "treatment outcome", "risk factors", "prognosis",
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isClinicalStop(term: string): boolean {
  return CLINICAL_STOPLIST.has(term.toLowerCase());
}

type YearRange = "2" | "5" | "10" | "all";

const YEAR_RANGES: { key: YearRange; label: string; color: string }[] = [
  { key: "2",   label: "≤ 2 years",   color: "#c0392b" },
  { key: "5",   label: "< 5 years",    color: "#d35400" },
  { key: "10",  label: "< 10 years",  color: "#e67e22" },
  { key: "all", label: "All time",    color: "#94a3b8" },
];

interface MeshTerm {
  term: string;
  lift: number;
  article_count: number;
}

interface Props {
  userSubspecialties: string[] | null;
  topSubspecialties: { tag: string; count: number }[];
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const duration = 500;
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

export default function MeshExplorer({ userSubspecialties, topSubspecialties }: Props) {
  const rawSubs = userSubspecialties?.length
    ? userSubspecialties
    : topSubspecialties.slice(0, 3).map((s) => s.tag);

  // Normalize to canonical names and drop the top-level specialty "Neurosurgery"
  const displaySubs = rawSubs
    .map((s) => toCanonical(s))
    .filter((s): s is string => s !== null);

  console.log("[MeshExplorer] rawSubs →", rawSubs, "| displaySubs →", displaySubs);

  const [activeTab, setActiveTab] = useState<string>(displaySubs[0] ?? "");
  const [meshTerms, setMeshTerms] = useState<MeshTerm[] | null>(null);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [clinicalOnly, setClinicalOnly] = useState(true);
  const [yearRange, setYearRange] = useState<YearRange>("2");
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [sortedSubs, setSortedSubs] = useState<string[]>(displaySubs);

  // On mount: fetch article counts per subspecialty and sort tabs
  useEffect(() => {
    if (displaySubs.length === 0) return;
    const params = new URLSearchParams();
    params.set("specialty", "neurosurgery");
    for (const s of displaySubs) params.append("sub[]", s);
    fetch(`/api/rpc/subspecialty-counts?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { counts?: { subspecialty: string; article_count: number }[] }) => {
        const counts: Record<string, number> = {};
        for (const row of (data.counts ?? [])) {
          counts[row.subspecialty] = Number(row.article_count);
        }
        setSubCounts(counts);
        const sorted = [...displaySubs].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
        setSortedSubs(sorted);
        setActiveTab(sorted[0] ?? displaySubs[0] ?? "");
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load terms when tab or filters change.
  // When only yearRange changed, keep chips that still appear in the new list.
  useEffect(() => {
    if (!activeTab) return;
    setLoadingTerms(true);
    setMeshTerms(null);
    setCount(null);

    fetch(
      `/api/rpc/mesh-terms?subspecialty=${encodeURIComponent(activeTab)}&clinical_only=${clinicalOnly}&year_range=${yearRange}`
    )
      .then((r) => r.json())
      .then((data: unknown) => {
        const terms = (data as { terms?: MeshTerm[] })?.terms ?? [];
        setMeshTerms(terms);
        const newTermSet = new Set(terms.map((t) => t.term));
        setSelectedTerms((prev) => prev.filter((t) => newTermSet.has(t)));
      })
      .catch(() => setMeshTerms([]))
      .finally(() => setLoadingTerms(false));
  }, [activeTab, clinicalOnly, yearRange]);

  // Fetch count when selected terms change
  useEffect(() => {
    if (selectedTerms.length === 0) {
      setCount(null);
      return;
    }
    const controller = new AbortController();
    setLoadingCount(true);
    const params = new URLSearchParams();
    params.set("subspecialty", activeTab);
    params.set("year_range", yearRange);
    for (const t of selectedTerms) params.append("mesh[]", t);

    fetch(`/api/articles/mesh-count?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { count: number }) => setCount(data.count ?? 0))
      .catch(() => {})
      .finally(() => setLoadingCount(false));

    return () => controller.abort();
  }, [selectedTerms, activeTab, yearRange]);

  function toggleTerm(term: string) {
    setSelectedTerms((prev) =>
      prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term]
    );
  }

  // Build CTA href
  function buildHref() {
    const params = new URLSearchParams();
    params.set("subspecialty", activeTab);
    params.set("period", "alle");
    for (const t of selectedTerms) params.append("mesh[]", t);
    return `/articles?${params.toString()}`;
  }

  if (displaySubs.length === 0) return null;

  return (
    <div className={dmSans.className}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
            Explore by topic
          </span>
          <span
            className={dmMono.className}
            style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}
          >
            Distinctive MeSH terms per subspecialty
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>Clinical only</span>
          <button
            role="switch"
            aria-checked={clinicalOnly}
            onClick={() => setClinicalOnly(prev => !prev)}
            style={{
              position: "relative",
              display: "inline-flex",
              width: "44px",
              height: "24px",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              backgroundColor: clinicalOnly ? "#4a7c2f" : "#cbd5e1",
              transition: "background-color 150ms",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: clinicalOnly ? "23px" : "3px",
                width: "18px",
                height: "18px",
                borderRadius: "9999px",
                backgroundColor: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                transition: "left 150ms",
              }}
            />
          </button>
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: "2px",
          padding: "12px 16px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fafbfc",
        }}>
          {sortedSubs.map((sub) => {
            const isActive = activeTab === sub;
            const tabCount = subCounts[sub];
            return (
              <button
                key={sub}
                onClick={() => setActiveTab(sub)}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "#64748b",
                  background: isActive
                    ? "linear-gradient(135deg, #c0392b, #a93226)"
                    : "transparent",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                  boxShadow: isActive ? "0 2px 8px rgba(192,57,43,0.3)" : "none",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {sub}
                {tabCount !== undefined && (
                  <span
                    className={dmMono.className}
                    style={{
                      fontSize: "10px",
                      fontWeight: 400,
                      opacity: isActive ? 0.75 : 0.55,
                    }}
                  >
                    {tabCount.toLocaleString("en-US")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body: year-range rail + chips */}
        <div style={{ display: "flex", gap: "0" }}>

          {/* Year-range rail */}
          <div style={{
            padding: "16px 16px 16px 16px",
            flexShrink: 0,
            minWidth: "116px",
          }}>
            <div style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#94a3b8",
              marginBottom: "10px",
              paddingLeft: "10px",
            }}>
              Period
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {YEAR_RANGES.map(({ key, label, color }) => {
                const isActive = yearRange === key;
                return (
                  <button
                    key={key}
                    onClick={() => setYearRange(key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 10px",
                      border: isActive ? `2px solid ${color}` : "2px solid transparent",
                      borderRadius: "8px",
                      background: isActive ? `${color}12` : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: isActive ? color : "#e2e8f0",
                      flexShrink: 0,
                      transition: "background 0.15s ease",
                    }} />
                    <span style={{
                      fontSize: "12px",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#1e293b" : "#94a3b8",
                      transition: "color 0.15s ease",
                    }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: "1px", background: "#f1f5f9", margin: "12px 0", flexShrink: 0 }} />

          {/* Chips + footer */}
          <div style={{ flex: 1, padding: "20px 20px 20px 16px", minWidth: 0 }}>
            {loadingTerms && (
              <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>
                Loading topics…
              </div>
            )}

            {!loadingTerms && meshTerms !== null && meshTerms.length === 0 && (
              <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>
                No distinctive topics found for this subspecialty yet.
              </div>
            )}

            {!loadingTerms && meshTerms && meshTerms.length > 0 && (
              <>
                {/* Chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                  {meshTerms.map((t) => {
                    const selected = selectedTerms.includes(t.term);
                    return (
                      <button
                        key={t.term}
                        onClick={() => toggleTerm(t.term)}
                        title={`Lift: ${t.lift}× · ${t.article_count} articles`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          fontSize: "12.5px",
                          fontWeight: selected ? 600 : 500,
                          color: selected ? "#fff" : "#334155",
                          background: selected
                            ? "linear-gradient(135deg, #c0392b, #a93226)"
                            : "#f1f5f9",
                          border: selected ? "none" : "1px solid #e2e8f0",
                          borderRadius: "20px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          fontFamily: "inherit",
                          boxShadow: selected ? "0 2px 8px rgba(192,57,43,0.3)" : "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.term}
                        <span
                          className={dmMono.className}
                          style={{
                            fontSize: "10px",
                            opacity: 0.7,
                            fontWeight: 400,
                          }}
                        >
                          {t.article_count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Footer: count + CTA */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  minHeight: "36px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    {selectedTerms.length > 0 && (
                      <>
                        <span style={{
                          fontSize: "28px",
                          fontWeight: 700,
                          color: "#1e293b",
                          lineHeight: 1,
                          letterSpacing: "-0.01em",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {loadingCount
                            ? <span style={{ opacity: 0.4 }}>…</span>
                            : <AnimatedNumber value={count ?? 0} />
                          }
                        </span>
                        <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>
                          articles match
                        </span>
                      </>
                    )}
                    {selectedTerms.length === 0 && (
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                        Select topics above to filter articles
                      </span>
                    )}
                  </div>

                  {selectedTerms.length > 0 && (
                    <Link
                      href={buildHref()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "8px 18px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#fff",
                        background: "linear-gradient(135deg, #c0392b, #a93226)",
                        borderRadius: "8px",
                        textDecoration: "none",
                        boxShadow: "0 2px 8px rgba(192,57,43,0.3)",
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      Show {count !== null ? count.toLocaleString("en-US") : "…"} articles →
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
