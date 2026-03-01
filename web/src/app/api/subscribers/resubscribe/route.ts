import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

const UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

  // Token TTL is 30 days; the undo window (10 min) is always within that,
  // so an expired token here means the undo window is also gone.
  const { subscriberId, isValid, isExpired } = verifyUnsubscribeToken(token);

  if (isExpired || !isValid || !subscriberId) {
    return NextResponse.json(
      { ok: false, error: "This link is no longer valid", windowExpired: true },
      { status: 410 }
    );
  }

  const admin = createAdminClient();

  const { data: user, error: fetchError } = await admin
    .from("users")
    .select("status, unsubscribed_at")
    .eq("id", subscriberId)
    .single();

  if (fetchError || !user) {
    return NextResponse.json(
      { ok: false, error: "Subscriber not found" },
      { status: 404 }
    );
  }

  if (user.status !== "unsubscribed" || !user.unsubscribed_at) {
    return NextResponse.json(
      { ok: false, error: "No recent unsubscribe found" },
      { status: 400 }
    );
  }

  const elapsed = Date.now() - new Date(user.unsubscribed_at).getTime();
  if (elapsed > UNDO_WINDOW_MS) {
    return NextResponse.json(
      {
        ok: false,
        error: "The undo window has expired. Please contact support.",
        windowExpired: true,
      },
      { status: 410 }
    );
  }

  // Reactivate — treat as if they never unsubscribed
  const { error: updateError } = await admin
    .from("users")
    .update({ status: "active", unsubscribed_at: null })
    .eq("id", subscriberId);

  if (updateError) {
    console.error("[resubscribe] update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "Failed to process request" },
      { status: 500 }
    );
  }

  // Mark the corresponding log entry as resubscribed
  await admin
    .from("unsubscribe_log")
    .update({ resubscribed_at: new Date().toISOString() })
    .eq("user_id", subscriberId)
    .is("resubscribed_at", null);

  return NextResponse.json({ ok: true });
}
