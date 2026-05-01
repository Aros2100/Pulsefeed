"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassBAddress {
  id:                    string;
  position:              number;
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  region:                string | null;
  continent:             string | null;
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  confidence:            string | null;
  state_source:          string | null;
  ai_action:             string | null;
  ai_changes:            string[] | null;
  ai_processed_at:       string | null;
}

interface GeoCardProps {
  articleId:   string;
  geoClass:    string | null;
  addressRows: ClassBAddress[];          // all rows from article_geo_addresses
  // article_geo_metadata
  metaGeoConfidence:       string | null;
  metaParserProcessedAt:   string | null;
  metaParserVersion:       string | null;
  metaAiProcessedAt:       string | null;
  metaAiModel:             string | null;
  metaAiPromptVersion:     string | null;
  metaAiChanges:           string[];
  metaEnrichedAt:          string | null;
  metaEnrichedStateSource: string | null;
  metaClassBAddressCount?: number | null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    green:  { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    red:    { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    blue:   { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    purple: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
    orange: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
    gray:   { bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
  };
  const s = styles[color] ?? styles.blue;
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: "999px",
      fontSize: "11px", fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      marginBottom: "12px", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function CardHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{
      background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
      padding: "10px 24px", display: "flex", alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
        textTransform: "uppercase", fontWeight: 700,
      }}>
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
  width: "100%", border: "1px solid #d1d5db", borderRadius: "7px",
  padding: "8px 12px", fontSize: "14px", fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

const ghostBtn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: "5px", border: "1px solid #d1d5db",
  background: "transparent", fontFamily: "inherit", fontSize: "11px",
  fontWeight: 600, cursor: "pointer", color: "#5a6a85",
};

function GeoRow({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr",
      padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px",
    }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

function sourceColor(src: string | null): string {
  if (src === "parser")     return "blue";
  if (src === "ai")         return "purple";
  if (src === "enrichment") return "green";
  if (src === "manual")     return "orange";
  return "gray";
}

function classBadgeColor(cls: string | null): string {
  if (cls === "A") return "green";
  if (cls === "B") return "blue";
  return "gray";
}

function classBadgeLabel(cls: string | null): string {
  if (cls === "A") return "Class A";
  if (cls === "B") return "Class B";
  if (cls === "C") return "Class C";
  return cls ?? "Unknown";
}

// ── Address row (shared by A and B) ──────────────────────────────────────────

function AddressRow({
  articleId,
  addr,
  showPositionHeader,
  onSaved,
}: {
  articleId:         string;
  addr:              ClassBAddress;
  showPositionHeader: boolean;
  onSaved:           (updates: Partial<ClassBAddress>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    country:      addr.country      ?? "",
    state:        addr.state        ?? "",
    city:         addr.city         ?? "",
    institution:  addr.institution  ?? "",
    institution2: addr.institution2 ?? "",
    institution3: addr.institution3 ?? "",
    department:   addr.department   ?? "",
    department2:  addr.department2  ?? "",
    department3:  addr.department3  ?? "",
  });

  function startEdit() {
    setForm({
      country:      addr.country      ?? "",
      state:        addr.state        ?? "",
      city:         addr.city         ?? "",
      institution:  addr.institution  ?? "",
      institution2: addr.institution2 ?? "",
      institution3: addr.institution3 ?? "",
      department:   addr.department   ?? "",
      department2:  addr.department2  ?? "",
      department3:  addr.department3  ?? "",
    });
    setEditing(true);
    setSavedMsg(false);
    setErrorMsg(null);
  }

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/articles/${articleId}/geo-addresses/${addr.id}`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form) }
      );
      const data = await res.json();
      if (data.ok) {
        onSaved({
          country:      form.country      || null,
          state:        form.state        || null,
          city:         form.city         || null,
          region:       data.region       ?? null,
          continent:    data.continent    ?? null,
          institution:  form.institution  || null,
          institution2: form.institution2 || null,
          institution3: form.institution3 || null,
          department:   form.department   || null,
          department2:  form.department2  || null,
          department3:  form.department3  || null,
          state_source: (form.state && form.state !== addr.state) ? "manual" : addr.state_source,
        });
        setEditing(false);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
      } else {
        setErrorMsg(data.error ?? "Unknown error");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  function editField(label: string, field: keyof typeof form) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "140px 1fr",
        padding: "5px 0", alignItems: "center",
      }}>
        <span style={{ color: "#888", fontSize: "14px" }}>{label}</span>
        <input
          style={INPUT_STYLE}
          value={form[field]}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          placeholder="—"
        />
      </div>
    );
  }

  const wrapper = (children: React.ReactNode) =>
    showPositionHeader ? (
      <div style={{
        border: "1px solid #e5e7eb", borderRadius: "8px",
        padding: "16px 20px", marginBottom: "12px", background: "#fafafa",
      }}>
        {children}
      </div>
    ) : <>{children}</>;

  return wrapper(
    <>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showPositionHeader ? "12px" : "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {showPositionHeader && (
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#5a6a85" }}>
              Address {addr.position}
            </span>
          )}
          {addr.confidence && (
            <Badge color={addr.confidence === "high" ? "green" : "orange"}>
              {addr.confidence}
            </Badge>
          )}
          {addr.state_source && (
            <Badge color={sourceColor(addr.state_source)}>
              state: {addr.state_source}
            </Badge>
          )}
          {addr.ai_action && addr.ai_action !== "kept" && (
            <Badge color="purple">{addr.ai_action}</Badge>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {savedMsg && (
            <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 600 }}>Saved ✓</span>
          )}
          {!editing && (
            <button onClick={startEdit} style={ghostBtn}>Edit</button>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", padding: "5px 0", alignItems: "center" }}>
            <span style={{ color: "#888", fontSize: "14px" }}>Continent</span>
            <span style={{ fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>Auto-calculated from country</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", padding: "5px 0", alignItems: "center" }}>
            <span style={{ color: "#888", fontSize: "14px" }}>Region</span>
            <span style={{ fontSize: "14px", color: "#9ca3af", fontStyle: "italic" }}>Auto-calculated from country</span>
          </div>
          {editField("Country",       "country")}
          {editField("State",         "state")}
          {editField("City",          "city")}
          {editField("Institution",   "institution")}
          {editField("Institution 2", "institution2")}
          {editField("Institution 3", "institution3")}
          {editField("Department",    "department")}
          {editField("Department 2",  "department2")}
          {editField("Department 3",  "department3")}
          {errorMsg && (
            <div style={{
              marginTop: "8px", padding: "8px 12px", background: "#fef2f2",
              border: "1px solid #fca5a5", borderRadius: "6px",
              fontSize: "13px", color: "#b91c1c",
            }}>
              {errorMsg}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button onClick={save} disabled={saving} style={{
              padding: "8px 16px", borderRadius: "7px", border: "none",
              fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              background: saving ? "#e5e7eb" : "#1a1a1a",
              color: saving ? "#9ca3af" : "#fff",
            }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
              style={{ ...ghostBtn, padding: "8px 16px", fontSize: "13px" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <GeoRow label="Department"    value={addr.department} />
          <GeoRow label="Department 2"  value={addr.department2} />
          <GeoRow label="Department 3"  value={addr.department3} />
          {(addr.departments_overflow ?? []).length > 0 && (
            <GeoRow label="Departments +" value={addr.departments_overflow.join(" · ")} />
          )}
          <GeoRow label="Institution"   value={addr.institution} />
          <GeoRow label="Institution 2" value={addr.institution2} />
          <GeoRow label="Institution 3" value={addr.institution3} />
          {(addr.institutions_overflow ?? []).length > 0 && (
            <GeoRow label="Institutions +" value={addr.institutions_overflow.join(" · ")} />
          )}
          <GeoRow label="City"      value={addr.city} />
          <GeoRow label="State"     value={addr.state} />
          <GeoRow label="Country"   value={addr.country} />
          <GeoRow label="Region"    value={addr.region} />
          <GeoRow label="Continent" value={addr.continent} />
        </>
      )}
    </>
  );
}

// ── Main GeoCard ───────────────────────────────────────────────────────────────

export default function GeoCard(props: GeoCardProps) {
  const [rows, setRows] = useState<ClassBAddress[]>(props.addressRows);

  function updateRow(id: string, updates: Partial<ClassBAddress>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
  }

  const isClassB = props.geoClass === "B";
  const hasRows  = rows.length > 0;

  return (
    <>
      {/* Geo Location */}
      <Card>
        <CardHeader label="Geo Location" />
        <CardBody>
          {/* Class badge */}
          {props.geoClass && (
            <div style={{
              display: "grid", gridTemplateColumns: "140px 1fr",
              padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: "14px",
              marginBottom: hasRows ? "12px" : 0,
            }}>
              <span style={{ color: "#888" }}>Class</span>
              <Badge color={classBadgeColor(props.geoClass)}>
                {classBadgeLabel(props.geoClass)}
              </Badge>
            </div>
          )}

          {!hasRows ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>
              Location data not available — article has not been parsed with the new geo pipeline yet.
            </p>
          ) : isClassB ? (
            /* Klasse B: list of address cards */
            rows.map((addr) => (
              <AddressRow
                key={addr.id}
                articleId={props.articleId}
                addr={addr}
                showPositionHeader
                onSaved={(u) => updateRow(addr.id, u)}
              />
            ))
          ) : (
            /* Klasse A: single address, flat style */
            <AddressRow
              key={rows[0].id}
              articleId={props.articleId}
              addr={rows[0]}
              showPositionHeader={false}
              onSaved={(u) => updateRow(rows[0].id, u)}
            />
          )}
        </CardBody>
      </Card>

      {/* Geo Metadata */}
      <Card>
        <CardHeader label="Geo Metadata" />
        <CardBody>
          <div style={{ fontSize: "13px", color: "#555" }}>
            <>
              {isClassB && props.metaClassBAddressCount != null && (
                <GeoRow label="Addresses"    value={String(props.metaClassBAddressCount)} />
              )}
              <GeoRow label="Confidence"     value={props.metaGeoConfidence} />
              <GeoRow label="Parser version" value={props.metaParserVersion} />
              <GeoRow label="Parser ran at"  value={props.metaParserProcessedAt ? fmt(props.metaParserProcessedAt) : null} />
              <GeoRow label="AI ran at"      value={props.metaAiProcessedAt ? fmt(props.metaAiProcessedAt) : null} />
              <GeoRow label="AI model"       value={props.metaAiModel} />
              <GeoRow label="AI prompt"      value={props.metaAiPromptVersion} />
              {props.metaAiChanges.length > 0 && (
                <GeoRow label="AI changes"   value={props.metaAiChanges.join(" · ")} />
              )}
              <GeoRow label="Enriched at"    value={props.metaEnrichedAt ? fmt(props.metaEnrichedAt) : null} />
              <GeoRow label="State source"   value={props.metaEnrichedStateSource} />
            </>
            {!props.metaParserProcessedAt && (
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
                Parser has not run for this article yet.
              </p>
            )}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
