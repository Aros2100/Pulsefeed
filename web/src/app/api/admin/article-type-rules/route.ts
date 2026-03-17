import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type Rule = {
  id: string;
  publication_type: string;
  article_type: string;
  is_active: boolean;
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("article_type_rules" as never)
    .select("*" as never)
    .order("article_type" as never, { ascending: true } as never)
    .order("publication_type" as never, { ascending: true } as never);

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  return NextResponse.json({ ok: true, data: (data ?? []) as Rule[] });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = patchSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("article_type_rules" as never)
    .update({ is_active: result.data.is_active } as never)
    .eq("id" as never, result.data.id as never);

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

const postSchema = z.object({
  publication_type: z.string().min(1),
  article_type: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = postSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("article_type_rules" as never)
    .insert({
      publication_type: result.data.publication_type,
      article_type: result.data.article_type,
      is_active: true,
    } as never)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data as Rule });
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = deleteSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("article_type_rules" as never)
    .delete()
    .eq("id" as never, result.data.id as never);

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
