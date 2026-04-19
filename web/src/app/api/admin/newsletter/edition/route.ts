import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const patchSchema = z.object({
  id:    z.string().uuid(),
  intro: z.string(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

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

  const { id, intro } = result.data;

  const { data: current, error: fetchError } = await admin
    .from("newsletter_editions")
    .select("content")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });

  const { error } = await admin
    .from("newsletter_editions")
    .update({ content: { ...(current?.content ?? {}), intro } })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
