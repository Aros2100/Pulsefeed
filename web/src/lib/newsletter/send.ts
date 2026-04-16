import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const FROM = process.env.NEWSLETTER_FROM_EMAIL ?? "PulseFeed <newsletter@pulsefeed.dk>";

export interface NewsletterArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  article_type: string | null;
  short_resume: string | null;
  pubmed_id: string | null;
}

export interface NewsletterContent {
  general: NewsletterArticle[];
  subspecialties: { name: string; articles: NewsletterArticle[] }[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function articleCard(a: NewsletterArticle): string {
  const pubmedUrl = a.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/`
    : null;

  const meta = [a.article_type, a.journal_abbr, formatDate(a.published_date)]
    .filter(Boolean)
    .join(" · ");

  return `
    <div style="background:#fff;border-radius:8px;padding:18px 20px;margin-bottom:10px;border:1px solid #e8ecf2">
      <div style="font-size:15px;font-weight:700;color:#1a1a1a;line-height:1.4;margin-bottom:6px">
        ${pubmedUrl
          ? `<a href="${pubmedUrl}" style="color:#1a1a1a;text-decoration:none">${a.title}</a>`
          : a.title}
      </div>
      ${meta ? `<div style="font-size:12px;color:#888;margin-bottom:${a.short_resume ? "10px" : "0"}">${meta}</div>` : ""}
      ${a.short_resume ? `<div style="font-size:13px;color:#444;line-height:1.6">${a.short_resume}</div>` : ""}
      ${pubmedUrl ? `<div style="margin-top:10px"><a href="${pubmedUrl}" style="font-size:12px;color:#E83B2A;font-weight:600;text-decoration:none">Read on PubMed →</a></div>` : ""}
    </div>`;
}

function sectionBlock(title: string, articles: NewsletterArticle[]): string {
  if (articles.length === 0) return "";
  return `
    <div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#E83B2A;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #E83B2A">
        ${title}
      </div>
      ${articles.map(articleCard).join("")}
    </div>`;
}

function buildHtml(
  weekNumber: number,
  year: number,
  content: NewsletterContent,
  openToken: string,
  siteUrl: string,
  unsubscribeToken: string,
): string {
  const trackingPixel = `${siteUrl}/api/track/open?t=${openToken}`;
  const unsubscribeUrl = unsubscribeToken
    ? `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${siteUrl}/unsubscribe`;

  const sections = [
    ...content.subspecialties.map((s) => sectionBlock(s.name, s.articles)),
    sectionBlock("General", content.general),
  ].filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Inter,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px 48px">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px">
      <div style="font-size:22px;font-weight:800;color:#1a1a1a;letter-spacing:-0.5px">PulseFeed</div>
      <div style="font-size:13px;color:#888;margin-top:4px">Week ${weekNumber} · ${year}</div>
    </div>

    <!-- Content -->
    ${sections}

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;font-size:12px;color:#aaa;line-height:1.8">
      <div>PulseFeed · Weekly neurosurgery digest</div>
      <div><a href="${unsubscribeUrl}" style="color:#aaa">Unsubscribe</a></div>
    </div>

    <!-- Tracking pixel -->
    <img src="${trackingPixel}" width="1" height="1" style="display:block;width:1px;height:1px;border:0" alt="" />
  </div>
</body>
</html>`;
}

export async function sendNewsletter(
  userId: string,
  weekNumber: number,
  year: number,
  content: NewsletterContent,
): Promise<{ ok: true; sendId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulsefeed.dk";

  // Fetch user email + unsubscribe_token
  const [{ data: { user }, error: userErr }, { data: userRow }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("users").select("unsubscribe_token").eq("id", userId).maybeSingle(),
  ]);
  if (userErr || !user?.email) {
    return { ok: false, error: userErr?.message ?? "User not found" };
  }
  const unsubscribeToken = (userRow as { unsubscribe_token?: string | null } | null)?.unsubscribe_token ?? "";

  // Insert newsletter_sends row to get open_token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sendRow, error: insertErr } = await (admin as any)
    .from("newsletter_sends")
    .insert({ user_id: userId, week_number: weekNumber, year })
    .select("id, open_token")
    .single();

  if (insertErr || !sendRow) {
    return { ok: false, error: insertErr?.message ?? "Failed to create send record" };
  }

  const html = buildHtml(weekNumber, year, content, sendRow.open_token as string, siteUrl, unsubscribeToken);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({
    from:    FROM,
    to:      user.email,
    subject: `PulseFeed · Week ${weekNumber}`,
    html,
  });

  if (emailErr) {
    // Clean up the send record so it can be retried
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("newsletter_sends").delete().eq("id", sendRow.id);
    return { ok: false, error: (emailErr as { message?: string }).message ?? "Email send failed" };
  }

  return { ok: true, sendId: sendRow.id as string };
}
