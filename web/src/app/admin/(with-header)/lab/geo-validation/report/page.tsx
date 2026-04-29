import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

type ValidationRow = {
  bucket:             string;
  verdict_country:    string;
  verdict_city:       string;
  verdict_state:      string;
  verdict_institution: string;
  verdict_department: string;
};

type FieldStat = {
  total:       number;
  correct:     number;
  wrong_value: number;
  missing:     number;
  hallucinated: number;
  fragment:    number;
};

type BucketStat = Record<string, FieldStat>;

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
    .select("bucket, verdict_country, verdict_city, verdict_state, verdict_institution, verdict_department");

  const rows = (error ? [] : data ?? []) as ValidationRow[];
  const totalValidated = rows.length;

  // --- Report 1: Per-field quality across all validated ---
  const fieldTotals: Record<Field, FieldStat> = {
    country:     emptyFieldStat(),
    city:        emptyFieldStat(),
    state:       emptyFieldStat(),
    institution: emptyFieldStat(),
    department:  emptyFieldStat(),
  };
  for (const row of rows) {
    for (const f of FIELDS) {
      const v = row[`verdict_${f}` as keyof ValidationRow] as VerdictType;
      const stat = fieldTotals[f];
      stat.total++;
      if (v in stat) stat[v as keyof Omit<FieldStat, "total">]++;
    }
  }

  // --- Report 2: Verdict distribution across all 5 fields ---
  const verdictTotals: Record<VerdictType, number> = {
    correct: 0, wrong_value: 0, missing: 0, hallucinated: 0, fragment: 0,
  };
  let totalVerdicts = 0;
  for (const row of rows) {
    for (const f of FIELDS) {
      const v = row[`verdict_${f}` as keyof ValidationRow] as VerdictType;
      if (v && v in verdictTotals) {
        verdictTotals[v as VerdictType]++;
        totalVerdicts++;
      }
    }
  }

  // --- Report 3: Per-bucket quality (accuracy = correct / total) ---
  const bucketStats: BucketStat = {};
  for (const row of rows) {
    const b = row.bucket;
    if (!bucketStats[b]) bucketStats[b] = emptyFieldStat();
    const stat = bucketStats[b];
    stat.total += FIELDS.length;
    for (const f of FIELDS) {
      const v = row[`verdict_${f}` as keyof ValidationRow] as VerdictType;
      if (v === "correct") stat.correct++;
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
            Rapport
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            {totalValidated} artikler valideret
          </p>
        </div>

        {totalValidated === 0 && (
          <div style={{ color: "#888", fontSize: "14px", padding: "40px 0", textAlign: "center" as const }}>
            Ingen validerede artikler endnu.
          </div>
        )}

        {totalValidated > 0 && (
          <>
            {/* Report 1: Per-field quality */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Kvalitet per felt</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  Fordeling af udfald for hvert geo-felt
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Felt</th>
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

            {/* Report 2: Overall verdict distribution */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Samlet udfaldfordeling</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  Alle 5 felter på tværs af {totalValidated} artikler ({totalVerdicts} udfald i alt)
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Udfald</th>
                    <th style={TH_STYLE}>Antal</th>
                    <th style={TH_STYLE}>Andel</th>
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

            {/* Report 3: Per-bucket quality */}
            <div style={sectionStyle}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Kvalitet per bucket</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  Samlet accuracy (correct / alle udfald) per bucket
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Bucket</th>
                    <th style={TH_STYLE}>Artikler</th>
                    <th style={TH_STYLE}>Udfald</th>
                    <th style={{ ...TH_STYLE, color: VERDICT_COLORS.correct }}>Correct</th>
                    <th style={TH_STYLE}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {bucketKeys.map((b) => {
                    const stat  = bucketStats[b];
                    const arts  = rows.filter((r) => r.bucket === b).length;
                    const accPct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
                    return (
                      <tr key={b}>
                        <td style={{ ...TD_STYLE, fontWeight: 600 }}>{b}</td>
                        <td style={TD_STYLE}>{arts}</td>
                        <td style={TD_STYLE}>{stat.total}</td>
                        <td style={TD_STYLE}>
                          {stat.correct} <span style={{ color: "#888" }}>({pct(stat.correct, stat.total)})</span>
                        </td>
                        <td style={{
                          ...TD_STYLE,
                          fontWeight: 700,
                          color: accPct >= 80 ? "#15803d" : accPct >= 60 ? "#d97706" : "#dc2626",
                        }}>
                          {accPct}%
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
