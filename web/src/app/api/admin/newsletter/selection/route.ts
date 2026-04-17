import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const insertSchema = z.object({
  edition_id:   z.string().uuid(),
  article_id:   z.string().uuid(),
  subspecialty: z.string().min(1),
  sort_order:   z.number().int().min(0),
});

const deleteSchema = z.object({
  edition_id:   z.string().uuid(),
  article_id:   z.string().uuid(),
  subspecialty: z.string().min(1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = insertSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { edition_id, article_id, subspecialty, sort_order } = result.data;

  const { error } = await admin
    .from("newsletter_edition_articles")
    .insert({ edition_id, article_id, subspecialty, sort_order });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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

  const { edition_id, article_id, subspecialty } = result.data;

  const { error } = await admin
    .from("newsletter_edition_articles")
    .delete()
    .eq("edition_id", edition_id)
    .eq("article_id", article_id)
    .eq("subspecialty", subspecialty);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
