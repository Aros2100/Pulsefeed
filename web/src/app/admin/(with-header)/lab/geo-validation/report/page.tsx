import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

type ValidationRow = {
  bucket:              string;
  out_of_scope:        boolean;
  affiliation:         string | null;
  verdict_country:     string;
  verdict_city:        string;
  verdict_state:       string;
  verdict_institution: string;
  verdict_department:  string;
};

type FieldStat = {
  total:        number;
  correct:      number;
  wrong_value:  number;
  missing:      number;
  hallucinated: number;
  fragment:     number;
};

type BucketStat = {
  articles:     number;
  oos:          number;
  verdicts:     number;
  correct:      number;
};

const FIELDS = ["country", "city", "state", "institution", "department"] as const;
type Field = typeof FIELDS[number];

const FIELD_LABELS: Record<Field, string> = {
  country:     "Country",
  city:        "City",
  state:       "State",
  institution: "Institution",
  department:  "Department",
};

const VERDICT_TYPES = ["correct", "wrong_value", "missing", "hallucinated", "fragment"] as const;
type VerdictType = typeof VERDICT_TYPES[number];

const VERDICT_COLORS: Record<VerdictType, string> = {
  correct:      "#15803d",
  wrong_value:  "#dc2626",
  missing:      "#d97706",
  hallucinated: "#7c3aed",
  fragment:     "#0284c7",
};

function emptyFieldStat(): FieldStat {
  return { total: 0, correct: 0, wrong_value: 0, missing: 0, hallucinated: 0, fragment: 0 };
}

function pct(n: number, total: number) {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function VerdictPill({ type, count, total }: { type: VerdictType; count: number; total: number }) {
  if (count === 0) return <span style={{ color: "#bbb" }}>—</span>;
  return (
    <span style={{ color: VERDICT_COLORS[type], fontWeight: 600 }}>
      {count} <span style={{ fontWeight: 400, color: "#888" }}>({pct(count, total)})</span>
    </span>
  );
}

const TH_STYLE = {
  fontSize: "11px",
  fontWeight: 700 as const,
  color: "#888",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  padding: "10px 14px",
  textAlign: "left" as const,
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
  whiteSpace: "nowrap" as const,
};

const TD_STYLE = {
  fontSize: "13px",
  padding: "10px 14px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top" as const,
};

export default async function GeoValidationReportPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("geo_validation_results")
    .select("bucket, out_of_scope, affiliation, verdict_country, verdict_city, verdict_state, verdict_institution, verdict_department");

  const rows      = (error ? [] : data ?? []) as ValidationRow[];
  const total     = rows.length;
  const oosRows   = rows.filter((r) => r.out_of_scope);
  const inScope   = rows.filter((r) => !r.out_of_scope);
  const oosCount  = oosRows.length;

  // --- Length statistics ---
  function affLen(r: ValidationRow) { return (r.affiliation ?? "").length; }

  const oosLengths    = oosRows.map(affLen).sort((a, b) => a - b);
  const inScopeLengths = inScope.map(affLen);

  const mean = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  const median = (sorted: number[]) => {
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  const p90 = (sorted: number[]) => {
    if (!sorted.length) return 0;
    return sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
  };

  const oosMean   = mean(oosLengths);
  const oosMedian = median(oosLengths);
  const oosP90    = p90(oosLengths);
  const inScopeMean = mean(inScopeLengths);

  const HIST_BUCKETS = [
    { label: "< 50",      min: 0,   max: 50  },
    { label: "50–150",    min: 50,  max: 150 },
    { label: "150–250",   min: 150, max: 250 },
    { label: "250–350",   min: 250, max: 350 },
    { label: "350–500",   min: 350, max: 500 },
    { label: "> 500",     min: 500, max: Infinity },
  ] as const;

  const histCounts = HIST_BUCKETS.map(({ min, max }) =>
    oosLengths.filter((l) => l >= min && l < max).length
  );
  const histMax = Math.max(...histCounts, 1);

  // --- Report 1: Per-field quality — in-scope rows only ---
  const fieldTotals: Record<Field, FieldStat> = {
    country:     emptyFieldStat(),
    city:        emptyFieldStat(),
    state:       emptyFieldStat(),
    institution: emptyFieldStat(),
    department:  emptyFieldStat(),
  };
  for (const row of inScope) {
    for (const f of FIELDS) {
      const v = row[`verdict_${f}` as keyof ValidationRow] as VerdictType;
      const stat = fieldTotals[f];
      stat.total++;
      if (v in stat) (stat as Record<string, number>)[v]++;
    }
  }

  // --- Report 2: Verdict distribution — in-scope rows only ---
  const verdictTotals: Record<VerdictType, number> = {
    correct: 0, wrong_value: 0, missing: 0, hallucinated: 0, fragment: 0,
  };
  let totalVerdicts = 0;
  for (const row of inScope) {
    for (const f of FIELDS) {
      const v = row[`verdict_${f}` as keyof ValidationRow] as VerdictType;
      if (v && v in verdictTotals) {
        verdictTotals[v]++;
        totalVerdicts++;
      }
    }
  }

  // --- Report 3: Per-bucket quality + OOS breakdown ---
  const bucketStats: Record<string, BucketStat> = {};
  for (const row of rows) {
    const b = row.bucket;
    if (!bucketStats[b]) bucketStats[b] = { articles: 0, oos: 0, verdicts: 0, correct: 0 };
    const stat = bucketStats[b];
    stat.articles++;
    if (row.out_of_scope) {
      stat.oos++;
    } else {
      stat.verdicts += FIELDS.length;
      for (const f of FIELDS) {
        if ((row[`verdict_${f}` as keyof ValidationRow] as string) === "correct") stat.correct++;
      }
    }
  }
  const bucketKeys = Object.keys(bucketStats).sort();

  const sectionStyle = {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    marginBottom: "24px",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse" as const,
  };

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab/geo-validation" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Geo Validation
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            Geo Validation
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Report
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            {total} articles validated
          </p>
        </div>

        {total === 0 && (
          <div style={{ color: "#888", fontSize: "14px", padding: "40px 0", textAlign: "center" as const }}>
            No validated articles yet.
          </div>
        )}

        {total > 0 && (
          <>
            {/* Out-of-scope summary */}
            {oosCount > 0 && (
              <div style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#d97706" }}>
                    Out of scope: {oosCount} / {total} articles ({pct(oosCount, total)})
                  </span>
                  <p style={{ fontSize: "12px", color: "#888", margin: "2px 0 0" }}>
                    Excluded from accuracy calculations below. {inScope.length} in-scope articles remain.
                  </p>
                </div>
                <span style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#d97706",
                  minWidth: "48px",
                  textAlign: "right" as const,
                }}>
                  {pct(oosCount, total)}
                </span>
              </div>
            )}

            {/* OOS length statistics */}
            {oosCount > 0 && (
              <div style={{ ...sectionStyle }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>Out-of-scope affiliation length</div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                    Character length of out-of-scope affiliations vs in-scope — basis for safe-parsing length cap decisions
                  </div>
                </div>

                {/* Key metrics row */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  borderBottom: "1px solid #e5e7eb",
                }}>
                  {[
                    { label: "OOS mean",      value: oosMean,    },
                    { label: "OOS median",     value: oosMedian,  },
                    { label: "OOS p90",        value: oosP90,     highlight: true },
                    { label: "In-scope mean",  value: inScopeMean, muted: true },
                  ].map(({ label, value, highlight, muted }) => (
                    <div key={label} style={{
                      padding: "16px 20px",
                      borderRight: "1px solid #f3f4f6",
                    }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: "4px" }}>
                        {label}
                      </div>
                      <div style={{
                        fontSize: "22px",
                        fontWeight: 700,
                        color: muted ? "#9ca3af" : highlight ? "#d97706" : "#1a1a1a",
                      }}>
                        {value}
                      </div>
                      <div style={{ fontSize: "11px", color: "#bbb", marginTop: "2px" }}>chars</div>
                    </div>
                  ))}
                </div>

                {/* Histogram */}
                <div style={{ padding: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: "14px" }}>
                    Length distribution (out-of-scope articles)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
                    {HIST_BUCKETS.map(({ label }, i) => {
                      const count = histCounts[i];
                      const barPct = Math.round((count / histMax) * 100);
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "12px", color: "#5a6a85", width: "64px", flexShrink: 0, textAlign: "right" as const }}>
                            {label}
                          </span>
                          <div style={{ flex: 1, background: "#f3f4f6", borderRadius: "3px", height: "18px", overflow: "hidden" }}>
                            <div style={{
                              background: "#d97706",
                              width: count > 0 ? `${Math.max(barPct, 2)}%` : "0%",
                              height: "100%",
                              borderRadius: "3px",
                              transition: "width 0.3s",
                            }} />
                          </div>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: count > 0 ? "#1a1a1a" : "#bbb", width: "32px", flexShrink: 0 }}>
                            {count}
                          </span>
                          <span style={{ fontSize: "11px", color: "#bbb", width: "36px", flexShrink: 0 }}>
                            {oosCount > 0 ? `${Math.round((count / oosCount) * 100)}%` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* In-scope comparison note */}
                  {inScope.length > 0 && (
                    <div style={{
                      marginTop: "16px",
                      padding: "10px 14px",
                      background: "#f9fafb",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#5a6a85",
                    }}>
                      OOS mean <strong>{oosMean}</strong> chars vs in-scope mean <strong>{inScopeMean}</strong> chars
                      {oosMean > inScopeMean
                        ? <> — OOS affiliations are <strong style={{ color: "#d97706" }}>{oosMean - inScopeMean} chars longer</strong> on average</>
                        : oosMean < inScopeMean
                          ? <> — OOS affiliations are <strong>{inScopeMean - oosMean} chars shorter</strong> on average</>
                          : <> — same mean length</>
                      }
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Report 1: Per-field quality (in-scope only) */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Field quality</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  Verdict breakdown per geo field — {inScope.length} in-scope articles, out-of-scope excluded
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Field</th>
                    <th style={TH_STYLE}>Total</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.correct }}>Correct</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.wrong_value }}>Wrong value</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.missing }}>Missing</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.hallucinated }}>Hallucinated</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.fragment }}>Fragment</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map((f) => {
                    const stat = fieldTotals[f];
                    return (
                      <tr key={f}>
                        <td style={{ ...TD_STYLE, fontWeight: 600 }}>{FIELD_LABELS[f]}</td>
                        <td style={TD_STYLE}>{stat.total}</td>
                        <td style={TD_STYLE}>
                          <VerdictPill type="correct" count={stat.correct} total={stat.total} />
                        </td>
                        <td style={TD_STYLE}>
                          <VerdictPill type="wrong_value" count={stat.wrong_value} total={stat.total} />
                        </td>
                        <td style={TD_STYLE}>
                          <VerdictPill type="missing" count={stat.missing} total={stat.total} />
                        </td>
                        <td style={TD_STYLE}>
                          <VerdictPill type="hallucinated" count={stat.hallucinated} total={stat.total} />
                        </td>
                        <td style={TD_STYLE}>
                          <VerdictPill type="fragment" count={stat.fragment} total={stat.total} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Report 2: Overall verdict distribution (in-scope only) */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Overall verdict distribution</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  All 5 fields across {inScope.length} in-scope articles ({totalVerdicts} verdicts total)
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Verdict</th>
                    <th style={TH_STYLE}>Count</th>
                    <th style={TH_STYLE}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {VERDICT_TYPES.map((v) => (
                    <tr key={v}>
                      <td style={{ ...TD_STYLE, fontWeight: 600, color: VERDICT_COLORS[v] }}>
                        {v.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
                      </td>
                      <td style={TD_STYLE}>{verdictTotals[v]}</td>
                      <td style={{ ...TD_STYLE, color: VERDICT_COLORS[v], fontWeight: 600 }}>
                        {pct(verdictTotals[v], totalVerdicts)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f9fafb" }}>
                    <td style={{ ...TD_STYLE, fontWeight: 700 }}>Total</td>
                    <td style={{ ...TD_STYLE, fontWeight: 700 }}>{totalVerdicts}</td>
                    <td style={{ ...TD_STYLE, fontWeight: 700 }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Report 3: Per-bucket quality + OOS breakdown */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Per-bucket quality</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  Accuracy (correct / in-scope verdicts) and out-of-scope rate per bucket
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Bucket</th>
                    <th style={TH_STYLE}>Articles</th>
                    <th style={{ ...TH_STYLE, color: "#d97706" }}>Out of scope</th>
                    <th style={TH_STYLE}>Verdicts</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.correct }}>Correct</th>
                    <th style={TH_STYLE}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {bucketKeys.map((b) => {
                    const stat    = bucketStats[b];
                    const accPct  = stat.verdicts > 0 ? Math.round((stat.correct / stat.verdicts) * 100) : 0;
                    const oosPct  = stat.articles > 0 ? Math.round((stat.oos / stat.articles) * 100) : 0;
                    const hasInScope = stat.verdicts > 0;
                    return (
                      <tr key={b}>
                        <td style={{ ...TD_STYLE, fontWeight: 600 }}>{b}</td>
                        <td style={TD_STYLE}>{stat.articles}</td>
                        <td style={{ ...TD_STYLE, color: stat.oos > 0 ? "#d97706" : "#bbb", fontWeight: stat.oos > 0 ? 600 : 400 }}>
                          {stat.oos > 0 ? `${stat.oos} (${oosPct}%)` : "—"}
                        </td>
                        <td style={TD_STYLE}>{stat.verdicts}</td>
                        <td style={TD_STYLE}>
                          {hasInScope
                            ? <>{stat.correct} <span style={{ color: "#888" }}>({pct(stat.correct, stat.verdicts)})</span></>
                            : <span style={{ color: "#bbb" }}>—</span>
                          }
                        </td>
                        <td style={{
                          ...TD_STYLE,
                          fontWeight: 700,
                          color: !hasInScope ? "#bbb" : accPct >= 80 ? "#15803d" : accPct >= 60 ? "#d97706" : "#dc2626",
                        }}>
                          {hasInScope ? `${accPct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
