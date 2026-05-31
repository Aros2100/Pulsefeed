export interface TileColors {
  background: string; // tile bg
  label:      string; // label text + sublabel
  value:      string; // KPI number
}

export function KpiTile({ label, value, sub, colors }: {
  label:  string;
  value:  string;
  sub:    string;
  colors: TileColors;
}) {
  return (
    <div style={{ background: colors.background, borderRadius: "8px", padding: "14px", minWidth: 0 }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: colors.label, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "21px", fontWeight: 700, color: colors.value, lineHeight: 1.1, marginBottom: "4px" }}>
        {value}
      </div>
      <div style={{ fontSize: "11px", color: colors.label, opacity: 0.8 }}>
        {sub}
      </div>
    </div>
  );
}
