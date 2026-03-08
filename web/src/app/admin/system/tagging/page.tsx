import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import { scorePendingArticles } from "@/lib/tagging/auto-tagger";
import TaggingClient from "./TaggingClient";

export default async function TaggingPage() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);
  const specialty = activeSpecialties[0] ?? "neurosurgery";

  // Fetch all tagging rules
  const { data: rules } = await admin
    .from("tagging_rules" as never)
    .select("*" as never)
    .eq("specialty" as never, specialty as never)
    .order("total_decisions" as never, { ascending: false } as never);

  const typedRules = (rules ?? []) as {
    id: string;
    specialty: string;
    term: string;
    total_decisions: number;
    approved: number;
    rejected: number;
    approve_rate: number;
    min_decisions: number;
    status: "tracking" | "draft" | "active" | "disabled";
    activated_at: string | null;
  }[];

  // Score pending articles against active rules
  const scored = await scorePendingArticles(specialty);

  // Count total pending
  const { count: totalPending } = await admin
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .contains("specialty_tags", [specialty]);

  return (
    <TaggingClient
      rules={typedRules}
      readyArticles={scored.ready}
      borderlineArticles={scored.borderline}
      kpis={{
        totalPending: totalPending ?? 0,
        readyCount: scored.ready.length,
        borderlineCount: scored.borderline.length,
        noMatchCount: scored.noMatch,
      }}
      specialty={specialty}
    />
  );
}
