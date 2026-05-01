"use client";

import { useState } from "react";

interface GeoCardProps {
  articleId: string;
  geoClass: string | null;
  geoContinent: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  geoState: string | null;
  geoCity: string | null;
  geoDepartment: string | null;
  geoDepartment2: string | null;
  geoDepartment3: string | null;
  geoDepartmentsOverflow: string[];
  geoInstitution: string | null;
  geoInstitution2: string | null;
  geoInstitution3: string | null;
  geoInstitutionsOverflow: string[];
  geoParserConfidence: string | null;
  aiLocationAttempted: boolean | null;
  geoDefinedAt: string | null;
  // article_geo_metadata
  metaGeoConfidence: string | null;
  metaParserProcessedAt: string | null;
  metaParserVersion: string | null;
  metaAiProcessedAt: string | null;
  metaAiModel: string | null;
  metaAiChanges: string[];
  metaEnrichedAt: string | null;
  metaEnrichedStateSource: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const styles: Record<string, { bg: string; color: string; border: string }> =
    {
      green: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
      red: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
      blue: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
      purple: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
      orange: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
      gray: { bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
    };
  const s = styles[color] ?? styles.blue;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        marginBottom: "12px",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#EEF2F7",
        borderBottom: "1px solid #dde3ed",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: "#5a6a85",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {right}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 24px" }}>{children}</div>;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  padding: "8px 12px",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export default function GeoCard(props: GeoCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live state for geo fields (updated after save)
  const [geo, setGeo] = useState({
    geoClass: props.geoClass,
    continent: props.geoContinent,
    region: props.geoRegion,
    country: props.geoCountry,
    state: props.geoState,
    city: props.geoCity,
    department: props.geoDepartment,
    department2: props.geoDepartment2,
    department3: props.geoDepartment3,
    departmentsOverflow: props.geoDepartmentsOverflow,
    institution: props.geoInstitution,
    institution2: props.geoInstitution2,
    institution3: props.geoInstitution3,
    institutionsOverflow: props.geoInstitutionsOverflow,
  });

  const [form, setForm] = useState({
    country: geo.country ?? "",
    state: geo.state ?? "",
    city: geo.city ?? "",
    institution: geo.institution ?? "",
    department: geo.department ?? "",
  });

  function startEditing() {
    setForm({
      country: geo.country ?? "",
      state: geo.state ?? "",
      city: geo.city ?? "",
      institution: geo.institution ?? "",
      department: geo.department ?? "",
    });
    setEditing(true);
    setSavedMsg(false);
    setErrorMsg(null);
  }

  function cancel() {
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/articles/${props.articleId}/geo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setGeo((prev) => ({
          ...prev,
          continent: data.continent ?? null,
          region: data.region ?? null,
          country: form.country || null,
          state: form.state || null,
          city: form.city || null,
          department: form.department || null,
          institution: form.institution || null,
        }));
        setEditing(false);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
      } else {
        setErrorMsg(data.error ?? "Ukendt fejl");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Netværksfejl");
    } finally {
      setSaving(false);
    }
  }

  // ── Read-only geo row ──
  const geoRow = (label: string, value: string | null) => {
    if (value == null) return null;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          padding: "7px 0",
          borderBottom: "1px solid #f5f5f5",
          fontSize: "14px",
        }}
      >
        <span style={{ color: "#888" }}>{label}</span>
        <span style={{ color: "#1a1a1a" }}>{value}</span>
      </div>
    );
  };

  // ── Edit row ──
  const editRow = (
    label: string,
    field: keyof typeof form,
    disabled?: boolean
  ) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        padding: "5px 0",
        alignItems: "center",
      }}
    >
      <span style={{ color: "#888", fontSize: "14px" }}>{label}</span>
      {disabled ? (
        <span
          style={{
            fontSize: "14px",
            color: "#9ca3af",
            fontStyle: "italic",
          }}
        >
          {field === "country"
            ? form.country || "—"
            : field === "state"
              ? form.state || "—"
              : "—"}{" "}
          (auto)
        </span>
      ) : (
        <input
          style={INPUT_STYLE}
          value={form[field]}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          placeholder="—"
        />
      )}
    </div>
  );

  const ghostBtn: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: "5px",
    border: "1px solid #d1d5db",
    background: "transparent",
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    color: "#5a6a85",
  };

  return (
    <>
      {/* Sektion 1: Artiklens lokation */}
      <Card>
        <CardHeader
          label="Geo Location"
          right={
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {savedMsg && (
                <span
                  style={{ fontSize: "11px", color: "#15803d", fontWeight: 600 }}
                >
                  Gemt ✓
                </span>
              )}
              {!editing && (
                <button onClick={startEditing} style={ghostBtn}>
                  Rediger
                </button>
              )}
            </div>
          }
        />
        <CardBody>
          {!editing && !geo.department && !geo.institution && !geo.city && !geo.state && !geo.country && !geo.region && !geo.continent ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>
              Location data not available — affiliation text could not be parsed.
            </p>
          ) : editing ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {/* Continent + Region: auto-calculated, shown as info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  padding: "5px 0",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#888", fontSize: "14px" }}>Continent</span>
                <span style={{ fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>
                  Auto-calculated from country
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  padding: "5px 0",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#888", fontSize: "14px" }}>Region</span>
                <span style={{ fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>
                  Auto-calculated from country
                </span>
              </div>
              {editRow("Country", "country")}
              {editRow("State", "state")}
              {editRow("City", "city")}
              {editRow("Institution", "institution")}
              {editRow("Department", "department")}
              {errorMsg && (
                <div style={{
                  marginTop: "8px",
                  padding: "8px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "#b91c1c",
                }}>
                  {errorMsg}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "12px",
                }}
              >
                <button
                  onClick={save}
                  disabled={saving}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "7px",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    background: saving ? "#e5e7eb" : "#1a1a1a",
                    color: saving ? "#9ca3af" : "#fff",
                  }}
                >
                  {saving ? "Gemmer…" : "Gem"}
                </button>
                <button
                  onClick={cancel}
                  disabled={saving}
                  style={{
                    ...ghostBtn,
                    padding: "8px 16px",
                    fontSize: "13px",
                  }}
                >
                  Annuller
                </button>
              </div>
            </div>
          ) : (
            <>
              {geo.geoClass && (
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px" }}>
                  <span style={{ color: "#888" }}>Class</span>
                  <span>
                    <Badge color={geo.geoClass === "A" ? "green" : "gray"}>
                      {geo.geoClass === "A" ? "Klasse A" : "Klasse C"}
                    </Badge>
                  </span>
                </div>
              )}
              {/* Departments */}
              {[geo.department, geo.department2, geo.department3]
                .filter(Boolean)
                .map((v, i) => geoRow(i === 0 ? "Department" : `Department ${i + 1}`, v))}
              {geo.departmentsOverflow.length > 0 && geoRow("Departments +", geo.departmentsOverflow.join(" · "))}
              {/* Institutions */}
              {[geo.institution, geo.institution2, geo.institution3]
                .filter(Boolean)
                .map((v, i) => geoRow(i === 0 ? "Institution" : `Institution ${i + 1}`, v))}
              {geo.institutionsOverflow.length > 0 && geoRow("Institutions +", geo.institutionsOverflow.join(" · "))}
              {geoRow("City", geo.city)}
              {geoRow("State", geo.state)}
              {geoRow("Country", geo.country)}
              {geoRow("Region", geo.region)}
              {geoRow("Continent", geo.continent)}
            </>
          )}
        </CardBody>
      </Card>

      {/* Geo Metadata */}
      <Card>
        <CardHeader label="Geo Metadata" />
        <CardBody>
          <div style={{ fontSize: "13px", color: "#555" }}>
            {geoRow("Confidence", props.metaGeoConfidence)}
            {geoRow("Parser version", props.metaParserVersion)}
            {geoRow("Parser ran at", props.metaParserProcessedAt ? fmt(props.metaParserProcessedAt) : null)}
            {geoRow("AI ran at", props.metaAiProcessedAt ? fmt(props.metaAiProcessedAt) : null)}
            {geoRow("AI model", props.metaAiModel)}
            {props.metaAiChanges.length > 0 && geoRow("AI changes", props.metaAiChanges.join(" · "))}
            {geoRow("Enriched at", props.metaEnrichedAt ? fmt(props.metaEnrichedAt) : null)}
            {geoRow("Enriched state source", props.metaEnrichedStateSource)}
            {!props.metaParserProcessedAt && (
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
                Parser har ikke kørt for denne artikel endnu.
              </p>
            )}
          </div>
        </CardBody>
      </Card>

    </>
  );
}
