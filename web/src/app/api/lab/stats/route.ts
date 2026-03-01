import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const module = searchParams.get("module") ?? "specialty_tag";

  if (!specialty || !(SPECIALTY_SLUGS as readonly string[]).includes(specialty)) {
    return NextResponse.json({ ok: false, error: "Invalid specialty" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [queueResult, decisionsResult] = await Promise.all([
    // Articles waiting in queue: circle=2, unverified, tagged with this specialty
    admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("circle", 2)
      .eq("verified", false)
      .contains("specialty_tags", [specialty]),

    // All lab decisions for this specialty+module
    admin
      .from("lab_decisions")
      .select("decision, decided_at")
      .eq("specialty", specialty)
      .eq("module", module)
      .order("decided_at", { ascending: false }),
  ]);

  if (queueResult.error) {
    return NextResponse.json({ ok: false, error: queueResult.error.message }, { status: 500 });
  }
  if (decisionsResult.error) {
    return NextResponse.json({ ok: false, error: decisionsResult.error.message }, { status: 500 });
  }

  const decisions = decisionsResult.data ?? [];
  const totalDecisions = decisions.length;
  const approvedCount = decisions.filter((d) => d.decision === "approved").length;
  const lastDecisionAt = decisions.length > 0 ? decisions[0].decided_at : null;
  const approvalRate = totalDecisions > 0 ? Math.round((approvedCount / totalDecisions) * 100) : null;

  return NextResponse.json({
    ok: true,
    queueCount: queueResult.count ?? 0,
    totalDecisions,
    approvedCount,
    approvalRate,
    lastDecisionAt,
  });
}
