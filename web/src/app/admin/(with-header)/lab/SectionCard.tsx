import Link from "next/link";

interface Badge {
  label: string;
  color: string;
  textColor?: string;
}

interface KPI {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

interface SectionCardProps {
  headerLabel: string;
  badges: Badge[];
  kpis: KPI[];
  actionLabel: string;
  actionHref: string;
  actionColor?: string;
  /** Optional extra element rendered next to the action button (e.g. a client component) */
  secondaryAction?: React.ReactNode;
}

export function SectionCard({
  headerLabel,
  badges,
  kpis,
  actionLabel,
  actionHref,
  actionColor = "#E83B2A",
  secondaryAction,
}: SectionCardProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
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
        <span
          style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#5a6a85",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {headerLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {badges.map((b) => (
            <span
              key={b.label}
              style={{
                fontSize: "11px",
                background: b.color,
                color: b.textColor ?? "#fff",
                borderRadius: "4px",
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ padding: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "24px",
            marginBottom: "24px",
          }}
        >
          {kpis.map((kpi) => (
            <div key={kpi.label}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#888",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: kpi.valueColor ?? "#1a1a1a",
                }}
              >
                {kpi.value}
              </div>
              {kpi.sub && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#aaa",
                    marginTop: "2px",
                  }}
                >
                  {kpi.sub}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Link
            href={actionHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "8px",
              padding: "10px 20px",
              background: actionColor,
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {actionLabel}
          </Link>
          {secondaryAction}
        </div>
      </div>
    </div>
  );
}
