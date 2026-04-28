import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const postSchema = z.object({
  week_number: z.number().int().min(1).max(53),
  year:        z.number().int().min(2020).max(2100),
  specialty:   z.string().refine((v) => v === ACTIVE_SPECIALTY, { message: "Invalid specialty" }),
});

const patchSchema = z.object({
  id:      z.string().min(1),
  content: z.object({}).passthrough().optional(),
  status:  z.enum(["draft", "approved", "sent"]).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = postSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { week_number, year, specialty } = result.data;

  // Check for duplicate
  const { data: existing, error: checkError } = await admin
    .from("newsletter_editions")
    .select("id")
    .eq("week_number", week_number)
    .eq("year", year)
    .eq("specialty", specialty)
    .maybeSingle();

  if (checkError) return NextResponse.json({ ok: false, error: checkError.message }, { status: 500 });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: `Edition for week ${week_number}/${year} already exists` },
      { status: 409 }
    );
  }

  const { data: edition, error: insertError } = await admin
    .from("newsletter_editions")
    .insert({ week_number, year, specialty, status: "draft", content: {} })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: edition.id as string });
}

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
