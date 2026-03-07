interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export default function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  const bg    = score >= 35 ? "#f0fdf4" : score >= 15 ? "#fffbeb" : "#fef2f2";
  const color = score >= 35 ? "#15803d" : score >= 15 ? "#d97706" : "#b91c1c";
  const style: React.CSSProperties =
    size === "md"
      ? { display: "inline-block", fontSize: "13px", fontWeight: 700, borderRadius: "6px", padding: "3px 10px", background: bg, color }
      : { display: "inline-block", fontSize: "11px", fontWeight: 700, borderRadius: "5px", padding: "1px 7px",  background: bg, color };
  return <span style={style}>{score}</span>;
}
