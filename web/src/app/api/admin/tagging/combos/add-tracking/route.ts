import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  specialty: z.string(),
  term_1: z.string(),
  term_2: z.string(),
  activate: z.boolean().optional(),
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

  const { specialty, activate } = parsed.data;
  const t1 = parsed.data.term_1 < parsed.data.term_2 ? parsed.data.term_1 : parsed.data.term_2;
  const t2 = parsed.data.term_1 < parsed.data.term_2 ? parsed.data.term_2 : parsed.data.term_1;

  const admin = createAdminClient();

  // Check if already exists
  const { data: existing } = await admin
    .from("tagging_rule_combos")
    .select("id, status")
    .eq("specialty", specialty)
    .eq("term_1", t1)
    .eq("term_2", t2)
    .maybeSingle();

  const row = existing as { id: string; status: string } | null;

  if (row) {
    if (row.status === "active") {
      return NextResponse.json({ ok: true, result: "already_active" });
    }
    if (activate) {
      // tracking/draft/disabled → activate
      await admin
        .from("tagging_rule_combos")
        .update({
          status: "active",
          activated_at: new Date().toISOString(),
          activated_by: auth.userId,
        })
        .eq("id", row.id);
      return NextResponse.json({ ok: true, result: "activated" });
    }
    if (row.status === "tracking") {
      return NextResponse.json({ ok: true, result: "already_tracking" });
    }
    // disabled → restore to tracking
    await admin
      .from("tagging_rule_combos")
      .update({ status: "tracking" })
      .eq("id", row.id);
    return NextResponse.json({ ok: true, result: "restored" });
  }

  // Insert new rule
  const { error } = await admin
    .from("tagging_rule_combos")
    .insert({
      specialty,
      term_1: t1,
      term_2: t2,
      status: activate ? "active" : "tracking",
      ...(activate ? { activated_at: new Date().toISOString(), activated_by: auth.userId } : {}),
    });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, result: activate ? "activated" : "created" });
}
