import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { buildRenderParams, isoWeekSaturday } from "@/lib/newsletter/send";
import { renderNewsletterHtml } from "@/lib/newsletter/render";
import { logArticleEvent, type EventActor, type EventSource } from "@/lib/article-events";

const schema = z.object({
  editionId: z.string().min(1),
  from:      z.string().min(1),
  subject:   z.string().min(1),
});

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

  const { editionId, from, subject } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.pulsefeeds.com";

  // Fetch edition (for week info + and_finally finalization)
  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, and_finally_article_id")
    .eq("id", editionId)
    .single();

  if (editionError || !edition) {
    return NextResponse.json({ ok: false, error: "Edition not found" }, { status: 404 });
  }

  // Fetch active subscribers
  const { data: subscribers } = await admin
    .from("users")
    .select("id, email, unsubscribe_token")
    .eq("status", "active")
    .contains("specialty_slugs", [ACTIVE_SPECIALTY]);

  const recipientList = (subscribers ?? []) as { id: string; email: string; unsubscribe_token: string | null }[];

  const resend = new Resend(process.env.RESEND_API_KEY);
  const saturdayDate = isoWeekSaturday(edition.week_number, edition.year);
  let sent = 0;

  for (const recipient of recipientList) {
    // Insert send row for tracking
    const { data: sendRow } = await admin
      .from("newsletter_sends")
      .insert({ user_id: recipient.id, week_number: edition.week_number, year: edition.year })
      .select("id, open_token")
      .single();

    const trackingPixelUrl = sendRow
      ? `${SITE_URL}/api/track/open?t=${(sendRow as { open_token: string }).open_token}`
      : null;

    const paramsResult = await buildRenderParams(admin, editionId, recipient.id, trackingPixelUrl);
    if ("error" in paramsResult) {
      console.error(`[send] buildRenderParams failed for user ${recipient.id}:`, paramsResult.error);
      if (sendRow) await admin.from("newsletter_sends").delete().eq("id", (sendRow as { id: string }).id);
      continue;
    }

    // Override issueDate with the correct Saturday
    const html = renderNewsletterHtml({ ...paramsResult, issueDate: saturdayDate });

    const { error: emailErr } = await resend.emails.send({ from, to: recipient.email, subject, html });

    if (!emailErr) {
      sent++;
    } else {
      console.error(`[send] email failed for ${recipient.email}:`, (emailErr as { message?: string }).message);
    }
  }

  // Mark edition as sent
  await admin.from("newsletter_editions").update({ status: "sent" }).eq("id", editionId);

  // Emit newsletter_sent per article (only if at least one recipient received the email)
  if (sent > 0) {
    const { data: editionArticles } = await admin
      .from("newsletter_edition_articles")
      .select("article_id, subspecialty")
      .eq("edition_id", editionId);

    const sentAt = new Date().toISOString();
    const articleIds = new Set<string>();
    for (const row of (editionArticles ?? []) as { article_id: string; subspecialty: string }[]) {
      if (articleIds.has(row.article_id)) continue; // dedupe — same article may appear in multiple sections
      articleIds.add(row.article_id);
      void logArticleEvent(row.article_id, "newsletter_sent", {
        actor:        `user:${auth.userId}` as EventActor,
        source:       "manual" as EventSource,
        edition_id:   editionId,
        sent_at:      sentAt,
        subspecialty: row.subspecialty,
      });
    }

    // Mark And finally article as used and emit newsletter_sent for it
    if (edition.and_finally_article_id) {
      await admin
        .from("articles")
        .update({ and_finally_used_in_edition_id: edition.id, and_finally_candidate: false })
        .eq("id", edition.and_finally_article_id);
      void logArticleEvent(edition.and_finally_article_id, "newsletter_sent", {
        actor:      `user:${auth.userId}` as EventActor,
        source:     "manual" as EventSource,
        edition_id: editionId,
        sent_at:    sentAt,
        slot:       "and_finally",
      });
    }
  }

  return NextResponse.json({ ok: true, sent });
}
