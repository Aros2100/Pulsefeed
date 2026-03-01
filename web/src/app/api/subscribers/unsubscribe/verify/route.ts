import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
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
  const { data: user, error } = await admin
    .from("users")
    .select("email, name, status")
    .eq("id", subscriberId)
    .single();

  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: "Subscriber not found" },
      { status: 404 }
    );
  }

  const firstName = user.name?.split(" ")[0] ?? "";

  return NextResponse.json({ ok: true, email: user.email, firstName });
}
