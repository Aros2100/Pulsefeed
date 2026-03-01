import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerSchema } from "@/lib/auth/schemas";
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

  const result = registerSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first.message, field: String(first.path[0] ?? "") },
      { status: 400 }
    );
  }

  const { firstName, lastName, email, password } = result.data;
  const name = `${firstName} ${lastName}`.trim();

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${request.nextUrl.origin}/auth/confirm`,
    },
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: toAuthError(error) },
      { status: 400 }
    );
  }

  // Supabase returns a user even if the email is already registered
  // (when email confirmation is enabled). Check identities to detect this.
  if (data.user && data.user.identities?.length === 0) {
    return NextResponse.json(
      { ok: false, error: "This email address is already in use", field: "email" },
      { status: 400 }
    );
  }

  // Set specialty to neurosurgery via admin client (bypasses RLS — user is not
  // yet confirmed, so the regular client with auth.uid() won't work).
  if (data.user) {
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("users")
      .update({ specialty_slugs: ["neurosurgery"] })
      .eq("id", data.user.id);

    if (updateError) {
      // Logged server-side but does not abort registration
      console.error("[register] specialty_slugs update failed:", updateError.message);
    }
  }

  return NextResponse.json({ ok: true, email });
}
