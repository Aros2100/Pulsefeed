import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTIES } from "@/lib/auth/specialties";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const specialties = await Promise.all(
    SPECIALTIES.map(async ({ slug, label }) => {
      const [c1Result, c2Result, logResult, trainingResult] = await Promise.all([
        admin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("circle", 1)
          .contains("specialty_tags", [slug]),
        admin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("circle", 2)
          .eq("verified", false)
          .contains("specialty_tags", [slug]),
        admin
          .from("import_logs")
          .select("completed_at, pubmed_filters!inner(specialty)")
          .eq("pubmed_filters.specialty", slug)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1),
        admin
          .from("lab_decisions")
          .select("decided_at")
          .eq("specialty", slug)
          .order("decided_at", { ascending: false })
          .limit(1),
      ]);

      return {
        slug,
        label,
        circle1Count: c1Result.count ?? 0,
        circle2Unverified: c2Result.count ?? 0,
        lastImportAt: logResult.data?.[0]?.completed_at ?? null,
        lastTrainingAt: trainingResult.data?.[0]?.decided_at ?? null,
      };
    })
  );

  return NextResponse.json({ ok: true, specialties });
}
