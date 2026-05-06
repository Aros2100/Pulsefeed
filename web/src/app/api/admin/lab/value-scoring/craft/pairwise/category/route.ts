import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModule } from "@/lib/lab/value-scoring/session";

const schema = z.object({
  label: z.string().trim().min(1).max(80),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { label } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const mod = await resolveModule(admin);
  if (!mod.ok) return NextResponse.json({ ok: false, error: mod.error }, { status: mod.status });

  // Reuse if a category with this label already exists for the module
  const { data: existing } = await admin
    .from("lab_value_reason_categories")
    .select("id, label, active")
    .eq("module_id", mod.moduleId)
    .ilike("label", label)
    .maybeSingle();

  if (existing) {
    if (!existing.active) {
      await admin.from("lab_value_reason_categories")
        .update({ active: true })
        .eq("id", existing.id);
    }
    return NextResponse.json({ ok: true, id: existing.id, label: existing.label, reused: true });
  }

  const { data: row, error } = await admin
    .from("lab_value_reason_categories")
    .insert({ module_id: mod.moduleId, label, active: true })
    .select("id, label")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: (row as { id: string }).id, label });
}
