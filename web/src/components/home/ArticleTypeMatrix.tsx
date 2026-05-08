const ARTICLE_TYPE_ORDER = [
  "Meta-analysis", "Review", "Intervention study", "Non-interventional study",
  "Basic study", "Case", "Guideline", "Surgical Technique", "Tech",
  "Administration", "Letters & Notices",
];

const ARTICLE_TYPE_DISPLAY: Record<string, string> = {
  "Non-interventional study": "Non-interventional",
  "Surgical Technique": "Surgical technique",
  "Case": "Case report",
};

const ARTICLE_TYPE_TOOLTIP: Record<string, string> = {
  "Meta-analysis": "Pooled quantitative analysis of multiple studies",
  "Review": "Narrative reviews and literature overviews",
  "Intervention study": "RCTs and other interventional trials",
  "Non-interventional study": "Observational research — cohort, registry, cross-sectional",
  "Basic study": "Laboratory, animal, or mechanistic research",
  "Case": "Case reports and case series",
  "Guideline": "Clinical practice guidelines and consensus statements",
  "Surgical Technique": "Step-by-step descriptions of operative procedures",
  "Tech": "New devices, implants, or technology evaluations",
  "Administration": "Health economics, policy, and organizational research",
  "Letters & Notices": "Correspondence, editorials, and brief communications",
};

export function ArticleTypeMatrix({ userSubs, shortNameMap, matrixRows }: {
  userSubs: string[];
  shortNameMap: Record<string, string>;
  matrixRows: { subspecialty: string; article_type: string; article_count: number }[];
}) {
  if (userSubs.length === 0) return null;
  const lookup: Record<string, Record<string, number>> = {};
  for (const row of matrixRows) {
    if (!lookup[row.subspecialty]) lookup[row.subspecialty] = {};
    lookup[row.subspecialty][row.article_type] = row.article_count;
  }
  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Introducing article types</div>
        <div style={{ fontSize: "11px", color: "#bbb" }}>Last 30 days</div>
      </div>
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px", lineHeight: 1.5 }}>
        We classify every article into <span style={{ fontWeight: 600, color: "#444" }}>one of 11 types</span> — here&apos;s what&apos;s published in your subspecialties.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingLeft: 0, paddingBottom: "10px", borderBottom: "2px solid #f0f2f5" }} />
            {userSubs.map(sub => (
              <th key={sub} style={{ fontSize: "11px", fontWeight: 700, color: "#555", textAlign: "center", padding: "0 6px 10px 6px", borderBottom: "2px solid #f0f2f5", width: "68px" }}>
                {shortNameMap[sub] ?? sub}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ARTICLE_TYPE_ORDER.map((type) => (
            <tr key={type} style={{ borderBottom: "1px solid #f8f9fb" }}>
              <td style={{ fontSize: "12px", fontWeight: 500, color: "#555", padding: "6px 6px 6px 0" }} title={ARTICLE_TYPE_TOOLTIP[type]}>
                {ARTICLE_TYPE_DISPLAY[type] ?? type}
              </td>
              {userSubs.map(sub => {
                const n = lookup[sub]?.[type] ?? 0;
                return (
                  <td key={sub} style={{ fontSize: "12px", fontWeight: 500, textAlign: "center", padding: "6px", color: n === 0 ? "#ddd" : "#444", background: n === 0 ? "transparent" : "#fdf0ef", borderRadius: "4px" }}>
                    {n === 0 ? "—" : n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
