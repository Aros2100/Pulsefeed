import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/auth/schemas";
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

  const result = loginSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first.message, field: String(first.path[0] ?? "") },
      { status: 400 }
    );
  }

  const { email, password } = result.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { ok: false, error: toAuthError(error) },
      { status: 401 }
    );
  }

  // Session is now set in cookies via createServerClient's setAll callback.
  // The client redirects to redirectTo after receiving this response.
  return NextResponse.json({ ok: true });
}
