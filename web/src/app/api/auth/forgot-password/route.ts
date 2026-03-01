import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/auth/schemas";

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

  const result = forgotPasswordSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message, field: "email" },
      { status: 400 }
    );
  }

  const { email } = result.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${request.nextUrl.origin}/auth/reset-password`,
  });

  if (error) {
    // Logged server-side, but never reveals whether the email exists
    // (prevents email enumeration)
    console.error("[forgot-password]", error.code, error.message);
  }

  // Always return 200 regardless of whether the email exists
  return NextResponse.json({ ok: true });
}
