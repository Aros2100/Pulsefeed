import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  author_id: z.string().uuid().nullable(),
});

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

  const result = schema.safeParse(body);
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

  const { author_id } = result.data;

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
      // Derive first/last name by splitting display_name on the last space
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

  const { error: updateError } = await supabase
    .from("users")
    .update({ author_id, ...profileFields })
    .eq("id", user.id);

  if (updateError) {
    console.error("[users/author] update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "Failed to save author link" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
