import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const deleteSchema = z.object({
  id: z.string().uuid(),
});

const patchSchema = z.object({
  updates: z.array(z.object({
    id:                    z.string().uuid(),
    sort_order:            z.number().int().min(0).optional(),
    is_global:             z.boolean().optional(),
    global_sort_order:     z.number().int().min(0).nullable().optional(),
    newsletter_headline:   z.string().nullable().optional(),
    newsletter_subheadline: z.string().nullable().optional(),
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
    result.data.updates.map(async ({ id, sort_order, is_global, global_sort_order, newsletter_headline, newsletter_subheadline }) => {
      const cleanStr = (v: string | null | undefined) =>
        v == null || v.trim() === "" ? null : v.trim();
      const patch: Record<string, unknown> = {};
      if (sort_order             !== undefined) patch.sort_order             = sort_order;
      if (is_global              !== undefined) patch.is_global              = is_global;
      if (global_sort_order      !== undefined) patch.global_sort_order      = global_sort_order ?? null;
      if (newsletter_headline    !== undefined) patch.newsletter_headline    = cleanStr(newsletter_headline);
      if (newsletter_subheadline !== undefined) patch.newsletter_subheadline = cleanStr(newsletter_subheadline);
      const { error } = await admin
        .from("newsletter_edition_articles")
        .update(patch)
        .eq("id", id);
      if (error) errors.push(error.message);
    })
  );

  if (errors.length > 0) return NextResponse.json({ ok: false, error: errors[0] }, { status: 500 });
  return NextResponse.json({ ok: true });
}
