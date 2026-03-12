import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const step = body.step as string;

  // ── Step: author ──
  if (step === "author") {
    const authorId = body.authorId as string | null;
    if (!authorId) {
      return NextResponse.json({ ok: false, error: "authorId required" }, { status: 400 });
    }

    // Fetch author profile to copy fields
    const { data: author } = await supabase
      .from("authors")
      .select("display_name, department, hospital, city, country")
      .eq("id", authorId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = { author_id: authorId };

    if (author) {
      const parts = (author.display_name ?? "").trim().split(/\s+/);
      updateData.first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? null;
      updateData.last_name = parts.length > 1 ? parts[parts.length - 1] : null;
      updateData.department = author.department;
      updateData.hospital = author.hospital;
      updateData.city = author.city;
      updateData.country = author.country;
    }

    const { error } = await supabase.from("users").update(updateData).eq("id", user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Step: geo ──
  if (step === "geo") {
    const country = (body.country as string) || null;
    const city = (body.city as string) || null;
    const hospital = (body.hospital as string) || null;

    const { error } = await supabase
      .from("users")
      .update({ country, city, hospital })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Step: complete ──
  if (step === "complete") {
    const subspecialties = body.subspecialties as string[] | undefined;

    // Sync name from auth metadata if not already set
    const metaName = (user.user_metadata?.name as string | undefined) ?? null;

    const { error } = await supabase
      .from("users")
      .update({
        subspecialties: subspecialties ?? [],
        onboarding_completed: true,
        ...(metaName ? { name: metaName } : {}),
      })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Persist in JWT metadata for fast page-level checks
    await supabase.auth.updateUser({ data: { onboarding_completed: true } });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown step" }, { status: 400 });
}
