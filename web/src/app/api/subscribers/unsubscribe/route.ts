import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || !token) {
    return NextResponse.json(
      { ok: false, error: "Missing token" },
      { status: 400 }
    );
  }

  const { subscriberId, isValid, isExpired } = verifyUnsubscribeToken(token);

  if (isExpired) {
    return NextResponse.json(
      { ok: false, error: "This unsubscribe link has expired", expired: true },
      { status: 410 }
    );
  }

  if (!isValid || !subscriberId) {
    return NextResponse.json(
      { ok: false, error: "Invalid unsubscribe link" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: user, error: updateError } = await admin
    .from("users")
    .update({ status: "unsubscribed", unsubscribed_at: now })
    .eq("id", subscriberId)
    .select("email")
    .single();

  if (updateError || !user) {
    console.error("[unsubscribe] update failed:", updateError?.message);
    return NextResponse.json(
      { ok: false, error: "Failed to process request" },
      { status: 500 }
    );
  }

  // Log the event — service_role bypasses RLS on unsubscribe_log
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const { error: logError } = await admin.from("unsubscribe_log").insert({
    user_id: subscriberId,
    email: user.email,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (logError) {
    // Non-fatal — the unsubscribe itself succeeded
    console.error("[unsubscribe] log insert failed:", logError.message);
  }

  return NextResponse.json({ ok: true });
}
