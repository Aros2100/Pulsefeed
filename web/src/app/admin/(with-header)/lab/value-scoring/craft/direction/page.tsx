import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import { computePairMatch } from "@/lib/lab/value-scoring/evaluation";
import NewDirectionButton from "./NewDirectionButton";

export default async function DirectionIndexPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  const { data: directions } = mod
    ? await admin.from("lab_value_directions").select("id, name, description, created_at").eq("module_id", mod.id).order("created_at")
    : { data: [] };

  type Dir = { id: string; name: string; description: string | null; created_at: string };
  const dirs = (directions ?? []) as Dir[];

  // For each direction, load its experiments and compute best pair-match
  const dirStats = await Promise.all(dirs.map(async d => {
    const { data: prompts } = await admin
      .from("lab_value_prompts")
      .select("id, version, created_at")
      .eq("direction_id", d.id)
      .order("version");
    type P = { id: string; version: number; created_at: string };
    const ps = (prompts ?? []) as P[];
    // Compute pair-match for each scored prompt
    let bestMatch: number | null = null;
    for (const p of ps) {
      try {
        const pm = await computePairMatch(admin, p.id);
        if (pm.totalPairs > 0) {
          const pct = pm.matchPercent;
          if (bestMatch === null || pct > bestMatch) bestMatch = pct;
        }
      } catch { /* not scored yet */ }
    }
    return { ...d, experimentCount: ps.length, bestMatch };
  }));

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              The Lab · Value Scoring · Craft
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Directions</h1>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
              Each direction is a hypothesis about how to score craft. Experiments within a direction share a scoring approach.
            </p>
          </div>
          <NewDirectionButton />
        </div>

        {dirStats.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
            No directions yet. Create one to start experimenting.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {dirStats.map(d => (
              <Link key={d.id} href={`/admin/lab/value-scoring/craft/direction/${d.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a1a", marginBottom: "4px" }}>{d.name}</div>
                    {d.description && <div style={{ fontSize: "12px", color: "#5a6a85", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "24px", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: d.bestMatch === null ? "#bbb" : d.bestMatch >= 75 ? "#059669" : "#92400e", fontVariantNumeric: "tabular-nums" }}>
                        {d.bestMatch === null ? "—" : `${d.bestMatch.toFixed(1)}%`}
                      </div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Best match</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>{d.experimentCount}</div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Experiments</div>
                    </div>
                    <span style={{ fontSize: "18px", color: "#E83B2A" }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div style={{ marginTop: "24px" }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to module
          </Link>
        </div>
      </div>
    </div>
  );
}
