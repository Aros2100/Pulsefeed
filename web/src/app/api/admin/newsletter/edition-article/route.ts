import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const deleteSchema = z.object({
  id: z.string().uuid(),
});

const patchSchema = z.object({
  updates: z.array(z.object({
    id:         z.string().uuid(),
    sort_order: z.number().int().min(0),
    is_global:  z.boolean(),
  })).min(1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = deleteSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { error } = await admin
    .from("newsletter_edition_articles")
    .delete()
    .eq("id", result.data.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const errors: string[] = [];
  await Promise.all(
    result.data.updates.map(async ({ id, sort_order, is_global }) => {
      const { error } = await admin
        .from("newsletter_edition_articles")
        .update({ sort_order, is_global })
        .eq("id", id);
      if (error) errors.push(error.message);
    })
  );

  if (errors.length > 0) return NextResponse.json({ ok: false, error: errors[0] }, { status: 500 });
  return NextResponse.json({ ok: true });
}
