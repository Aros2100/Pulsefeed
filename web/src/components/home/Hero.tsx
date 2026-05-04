import Link from "next/link";

export interface HeroData {
  firstName: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  total: {
    last7Days: number;
    previousDays: number;
    deltaPct: number;
    perDay: number;
  };
  subspecialties: Array<{
    name: string;
    last7Days: number;
    previousDays: number;
    deltaAbs: number;
  }>;
}

function DeltaBadge({ deltaPct }: { deltaPct: number }) {
  if (Math.abs(deltaPct) <= 1) {
    return (
      <span style={{ fontSize: "11px", fontWeight: 500, color: "#94a3b8" }}>
        ≈ same as last week
      </span>
    );
  }
  const isUp = deltaPct > 0;
  return (
    <span style={{ fontSize: "11px", fontWeight: 500, color: isUp ? "#D94A43" : "#64748b" }}>
      {isUp ? "↑" : "↓"} {Math.abs(deltaPct)}% vs last week
    </span>
  );
}

function SubDeltaLine({ deltaAbs }: { deltaAbs: number }) {
  if (deltaAbs === 0) {
    return (
      <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>
        Same as last week
      </span>
    );
  }
  const isUp = deltaAbs > 0;
  return (
    <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>
      {isUp ? `+${deltaAbs}` : `${deltaAbs}`} vs last week
    </span>
  );
}

export function Hero({ data }: { data: HeroData }) {
  const { firstName, timeOfDay, total, subspecialties } = data;

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid rgba(0,0,0,0.06)",
      borderRadius: "12px",
      padding: "2rem 1.75rem",
      marginBottom: "1.5rem",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "40px",
      alignItems: "stretch",
    }}>

      {/* Left column — Total volume */}
      <div style={{
        borderRight: "0.5px solid rgba(0,0,0,0.08)",
        paddingRight: "40px",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        {/* Greeting */}
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic", fontSize: "13px", color: "#D94A43", marginBottom: "6px",
        }}>
          Good {timeOfDay}, {firstName}
        </div>

        {/* Setup line */}
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "16px", lineHeight: 1.35, color: "#475569", marginBottom: "18px",
        }}>
          In the last 7 days, neurosurgery on PubMed produced:
        </div>

        {/* Big number */}
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "76px", lineHeight: 1, letterSpacing: "-0.03em",
          color: "#1a1a1a", fontWeight: 400,
        }}>
          {total.last7Days.toLocaleString("en-US")}
        </div>

        {/* Anchor row */}
        <div style={{
          display: "flex", alignItems: "baseline", gap: "14px",
          marginTop: "10px",
        }}>
          <span style={{
            fontSize: "10px", letterSpacing: "0.08em", color: "#94a3b8",
            textTransform: "uppercase",
          }}>
            New articles · {total.perDay} a day
          </span>
          <DeltaBadge deltaPct={total.deltaPct} />
        </div>
      </div>

      {/* Right column — Subspecialties */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {subspecialties.length === 0 ? (
          <div style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic", fontSize: "14px", color: "#64748b",
          }}>
            You haven&apos;t selected any subspecialties yet.{" "}
            <Link href="/profile" style={{ color: "#1a1a1a", textDecoration: "underline" }}>
              Choose them →
            </Link>
          </div>
        ) : (
          <>
            {/* Setup line */}
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic", fontSize: "13px", color: "#64748b",
              marginBottom: "18px",
            }}>
              Including in your areas:
            </div>

            {/* Subspecialty rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {subspecialties.map((sub, i) => {
                const isLast = i === subspecialties.length - 1;
                return (
                  <div
                    key={sub.name}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      paddingBottom: isLast ? 0 : "12px",
                      borderBottom: isLast ? "none" : "0.5px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {/* Left: name + delta */}
                    <div>
                      <div style={{
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: "17px", color: "#1a1a1a", marginBottom: "2px",
                      }}>
                        {sub.name}
                      </div>
                      <SubDeltaLine deltaAbs={sub.deltaAbs} />
                    </div>

                    {/* Right: count */}
                    <div style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "28px", lineHeight: 1, letterSpacing: "-0.01em",
                      color: "#1a1a1a", fontWeight: 400,
                    }}>
                      {sub.last7Days}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
