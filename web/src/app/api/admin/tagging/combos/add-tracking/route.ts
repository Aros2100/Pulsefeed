import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  specialty: z.string(),
  term_1: z.string(),
  term_2: z.string(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const { specialty } = parsed.data;
  const t1 = parsed.data.term_1 < parsed.data.term_2 ? parsed.data.term_1 : parsed.data.term_2;
  const t2 = parsed.data.term_1 < parsed.data.term_2 ? parsed.data.term_2 : parsed.data.term_1;

  const admin = createAdminClient();

  // Check if already exists
  const { data: existing } = await admin
    .from("tagging_rule_combos" as never)
    .select("id, status" as never)
    .eq("specialty" as never, specialty as never)
    .eq("term_1" as never, t1 as never)
    .eq("term_2" as never, t2 as never)
    .maybeSingle();

  const row = existing as { id: string; status: string } | null;

  if (row) {
    if (row.status === "tracking") {
      return NextResponse.json({ ok: true, result: "already_tracking" });
    }
    if (row.status === "active") {
      return NextResponse.json({ ok: true, result: "already_active" });
    }
    // disabled → restore to tracking
    await admin
      .from("tagging_rule_combos" as never)
      .update({ status: "tracking" } as never)
      .eq("id" as never, row.id as never);
    return NextResponse.json({ ok: true, result: "restored" });
  }

  // Insert new tracking rule
  const { error } = await admin
    .from("tagging_rule_combos" as never)
    .insert({
      specialty,
      term_1: t1,
      term_2: t2,
      status: "tracking",
    } as never);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, result: "created" });
}
