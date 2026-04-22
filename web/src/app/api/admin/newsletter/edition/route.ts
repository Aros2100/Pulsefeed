import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const patchSchema = z.object({
  id:      z.string().min(1),
  content: z.object({}).passthrough().optional(),
  status:  z.enum(["draft", "approved", "sent"]).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  console.log("[edition PATCH] received:", JSON.stringify(body));

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    console.log("[edition PATCH] validation error:", result.error.issues);
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { id, content, status } = result.data;

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {};

  if (content !== undefined) {
    const { data: current, error: fetchError } = await admin
      .from("newsletter_editions")
      .select("content")
      .eq("id", id)
      .single();

    if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });

    updatePayload.content = { ...(current?.content ?? {}), ...content };
  }

  if (status !== undefined) {
    updatePayload.status = status;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin
    .from("newsletter_editions")
    .update(updatePayload)
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
