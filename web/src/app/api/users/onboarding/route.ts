import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/auth/schemas";

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  const result = onboardingSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first.message },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { role_type, author_id } = result.data;

  // When linking an author, copy their structured profile fields to the user row
  let profileFields: {
    first_name?: string | null;
    last_name?: string | null;
    department?: string | null;
    hospital?: string | null;
    city?: string | null;
    country?: string | null;
  } = {};

  if (author_id) {
    const { data: author } = await supabase
      .from("authors")
      .select("display_name, department, hospital, city, country")
      .eq("id", author_id)
      .single();

    if (author) {
      const parts = (author.display_name ?? "").trim().split(/\s+/);
      const last_name  = parts.length > 1 ? parts[parts.length - 1] : null;
      const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? null;

      profileFields = {
        first_name,
        last_name,
        department: author.department,
        hospital:   author.hospital,
        city:       author.city,
        country:    author.country,
      };
    }
  }

  const { error: userError } = await supabase
    .from("users")
    .update({
      role_type,
      onboarding_completed: true,
      ...(author_id !== undefined ? { author_id } : {}),
      ...profileFields,
    })
    .eq("id", user.id);

  if (userError) {
    console.error("[onboarding] users update failed:", userError.message);
    return NextResponse.json(
      { ok: false, error: userError.message },
      { status: 500 }
    );
  }

  // Persist onboarding_completed in JWT metadata so the middleware can check
  // it without an extra DB query on every request.
  await supabase.auth.updateUser({ data: { onboarding_completed: true } });

  return NextResponse.json({ ok: true });
}
