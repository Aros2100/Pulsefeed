import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { buildRenderParams, isoWeekSaturday } from "@/lib/newsletter/send";
import { renderNewsletterHtml } from "@/lib/newsletter/render";

const schema = z.object({
  editionId: z.string().min(1),
  email:     z.string().email(),
  subPreset: z.number().int().min(0).max(3),
});

const FROM = process.env.NEWSLETTER_FROM_EMAIL ?? "PulseFeeds <newsletter@pulsefeeds.com>";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { editionId, email, subPreset } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year")
    .eq("id", editionId)
    .single();

  if (editionError || !edition) {
    return NextResponse.json({ ok: false, error: "Edition not found" }, { status: 404 });
  }

  // Build sub names matching the chosen preset (same logic as preview-html route)
  let previewSubNames: string[] = [];
  if (subPreset > 0) {
    const { data: subMeta } = await admin
      .from("subspecialties")
      .select("name")
      .eq("specialty", (await import("@/lib/auth/specialties")).ACTIVE_SPECIALTY)
      .eq("active", true)
      .order("sort_order")
      .limit(subPreset);
    previewSubNames = ((subMeta ?? []) as { name: string }[]).map((s) => s.name);
  }

  const paramsResult = await buildRenderParams(admin, editionId, auth.userId ?? "", null, { previewSubNames });
  if ("error" in paramsResult) {
    return NextResponse.json({ ok: false, error: paramsResult.error }, { status: 422 });
  }

  const saturdayDate = isoWeekSaturday(edition.week_number, edition.year);
  const html = renderNewsletterHtml({ ...paramsResult, issueDate: saturdayDate, firstName: null });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({
    from:    FROM,
    to:      email,
    replyTo: "hello@pulsefeeds.com",
    subject: `[TEST] PulseFeeds Issue ${edition.week_number} · ${edition.year}`,
    html,
  });

  if (emailErr) {
    return NextResponse.json({ ok: false, error: (emailErr as { message?: string }).message ?? "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
