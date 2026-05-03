import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const schema = z.object({
  headline:    z.string().nullable(),
  subheadline: z.string().nullable(),
});

const cleanStr = (v: string | null | undefined) =>
  v == null || v.trim() === "" ? null : v.trim();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { issueId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("newsletter_editions")
    .update({
      and_finally_headline:    cleanStr(parsed.data.headline),
      and_finally_subheadline: cleanStr(parsed.data.subheadline),
    })
    .eq("id", issueId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
