import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, INITIAL_PAIR_BATCH, SESSION_SIZE } from "@/lib/lab/value-scoring/craft-config";
import PairwiseClient from "./PairwiseClient";

export default async function CraftPairwisePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod || mod.phase !== "pairwise") {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#5a6a85" }}>
              {!mod
                ? "Module not found."
                : <>Module is not in pairwise phase (current: <strong>{mod.phase}</strong>).</>}
            </div>
            <Link href="/admin/lab/value-scoring/craft" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: "#E83B2A" }}>
              ← Back to module
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const moduleId = mod.id as string;

  // Total pairs + decided count
  const { count: totalPairs } = await admin
    .from("lab_value_pairs")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);

  const { count: decidedPairs } = await admin
    .from("lab_value_pairs")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);

  // Active reason categories
  const { data: catRows } = await admin
    .from("lab_value_reason_categories")
    .select("id, label, active")
    .eq("module_id", moduleId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  type Cat = { id: string; label: string; active: boolean };
  const categories = (catRows ?? []) as Cat[];

  return (
    <PairwiseClient
      totalPairs={totalPairs ?? INITIAL_PAIR_BATCH}
      decidedPairs={decidedPairs ?? 0}
      sessionSize={SESSION_SIZE}
      initialCategories={categories.map(c => ({ id: c.id, label: c.label }))}
    />
  );
}
