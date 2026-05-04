"use client";

const TYPES = ["All", "Meta-analysis", "Review", "Intervention study", "Non-interventional study", "Case", "Guideline", "Surgical Technique", "Tech", "Other"];

export function ArticleTypeFilter({
  active,
  onChange,
}: {
  active: string;
  onChange: (type: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
      <span style={{ fontSize: "11px", color: "#94a3b8", flexShrink: 0 }}>Article type:</span>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {TYPES.map((t) => {
          const isActive = t === active;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              style={{
                fontSize: "11px", fontWeight: isActive ? 500 : 400,
                padding: "4px 10px", borderRadius: "6px",
                border: `0.5px solid ${isActive ? "#64748b" : "#e2e8f0"}`,
                background: isActive ? "#f1f5f9" : "transparent",
                color: isActive ? "#334155" : "#64748b",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
