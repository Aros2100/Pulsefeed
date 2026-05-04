import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const FROM = process.env.NEWSLETTER_FROM_EMAIL ?? "PulseFeeds <notifications@pulsefeeds.com>";

export interface NotificationPayload {
  userId:   string;
  type:     string;
  title:    string;
  message?: string;
  link?:    string;
}

export async function sendNotification(payload: NotificationPayload) {
  const { userId, type, title, message, link } = payload;
  const admin = createAdminClient();

  await admin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message: message ?? null,
    link:    link ?? null,
  });

  const { data: userRow } = await admin
    .from("users")
    .select("email_notifications")
    .eq("id", userId)
    .maybeSingle();

  if (!userRow?.email_notifications) return;

  const { data: { user } } = await admin.auth.admin.getUserById(userId);
  if (!user?.email) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const htmlBody = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f5f7fa">
      <div style="background:#fff;border-radius:10px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.07)">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;color:#1a1a1a">${title}</div>
        ${message ? `<div style="font-size:14px;color:#555;margin-bottom:20px;line-height:1.6">${message}</div>` : ""}
        ${link ? `<a href="${link}" style="display:inline-block;background:#E83B2A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">View →</a>` : ""}
      </div>
      <div style="font-size:12px;color:#999;margin-top:16px;text-align:center">
        PulseFeed · <a href="${process.env.NEXT_PUBLIC_SITE_URL}/profile" style="color:#999">Manage notifications</a>
      </div>
    </div>`;

  await resend.emails.send({
    from:    FROM,
    to:      user.email,
    subject: title,
    html:    htmlBody,
  }).catch((err: unknown) => {
    console.error("[notifications] email send error:", err);
  });
}
