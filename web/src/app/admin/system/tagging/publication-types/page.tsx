"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import TaggingNav from "../TaggingNav";

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: "11px",
  fontWeight: 700,
  color: "#5a6a85",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: "1px solid #dde3ed",
  background: "#EEF2F7",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
  fontSize: "13px",
};

interface Rule {
  id: string;
  pubmed_type: string;
  article_type: string | null;
  study_design: string | null;
  match_count: number | null;
}

interface Category {
  id: string;
  name: string;
}

export default function PublicationTypesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [articleTypeCats, setArticleTypeCats] = useState<Category[]>([]);
  const [studyDesignCats, setStudyDesignCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/tagging/publication-type-rules");
    const data = await res.json();
    if (data.ok) {
      setRules(data.rules);
      setArticleTypeCats(data.articleTypeCategories);
      setStudyDesignCats(data.studyDesignCategories);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRun = async () => {
    setRunning(true);
    await fetch("/api/admin/tagging/publication-type-rules/run", { method: "POST" });
    setTimeout(() => setRunning(false), 3000);
  };

  const handleUpdate = async (
    id: string,
    field: "article_type" | "study_design",
    value: string
  ) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;

    const updated = { ...rule, [field]: value || null };
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    setSavingId(id);

    await fetch("/api/admin/tagging/publication-type-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        article_type: updated.article_type,
        study_design: updated.study_design,
      }),
    });

    setSavingId(null);
  };

  // KPI calculations
  const activeRules = rules.filter((r) => r.article_type || r.study_design).length;
  const unmappedRules = rules.length - activeRules;

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <div
        style={{
          fontFamily: "var(--font-inter), Inter, sans-serif",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "40px 24px 0",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <Link
            href="/admin/system"
            style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}
          >
            ← System
          </Link>
        </div>
        <TaggingNav />

        {/* KPI Cards */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
          {[
            { label: "Total regler", value: rules.length },
            { label: "Aktive (har mapping)", value: activeRules },
            { label: "Uden mapping", value: unmappedRules },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: "#fff",
                borderRadius: "10px",
                boxShadow: SHADOW,
                padding: "20px 28px",
                minWidth: "160px",
              }}
            >
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>
                {loading ? "–" : kpi.value}
              </div>
            </div>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                padding: "10px 24px",
                background: running ? "#94a3b8" : "#1a1a1a",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              {running ? "Kører mapping…" : "Kør mapping"}
            </button>
          </div>
        </div>

        {/* Rules Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: SHADOW,
            overflow: "hidden",
            marginBottom: "40px",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>PubMed Type</th>
                <th style={{ ...thStyle, width: "260px" }}>→ Article Type</th>
                <th style={{ ...thStyle, width: "260px" }}>→ Study Design</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>
                    Indlæser…
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500 }}>{rule.pubmed_type}</span>
                      {savingId === rule.id && (
                        <span style={{ marginLeft: "8px", fontSize: "11px", color: "#94a3b8" }}>
                          Gemmer…
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={rule.article_type ?? ""}
                        onChange={(e) => handleUpdate(rule.id, "article_type", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          border: "1px solid #dde3ed",
                          borderRadius: "6px",
                          fontSize: "13px",
                          background: "#fff",
                          color: rule.article_type ? "#1a1a1a" : "#94a3b8",
                        }}
                      >
                        <option value="">—</option>
                        {articleTypeCats.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={rule.study_design ?? ""}
                        onChange={(e) => handleUpdate(rule.id, "study_design", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          border: "1px solid #dde3ed",
                          borderRadius: "6px",
                          fontSize: "13px",
                          background: "#fff",
                          color: rule.study_design ? "#1a1a1a" : "#94a3b8",
                        }}
                      >
                        <option value="">—</option>
                        {studyDesignCats.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
