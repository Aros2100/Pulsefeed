import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updatePasswordSchema } from "@/lib/auth/schemas";
import { toAuthError } from "@/lib/auth/errors";

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

  const result = updatePasswordSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first.message, field: String(first.path[0] ?? "") },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Requires an active session — set by the verifyOtp call on the client
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "Your session has expired. Please request a new password reset link.",
      },
      { status: 401 }
    );
  }

  const { password } = result.data;
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return NextResponse.json(
      { ok: false, error: toAuthError(error) },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
