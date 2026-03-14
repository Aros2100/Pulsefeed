import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // ── Step: author-geo (profile review after author link) ──
  if (step === "author-geo") {
    const country = (body.country as string) || null;
    const city = (body.city as string) || null;
    const state = (body.state as string) || null;
    const hospital = (body.hospital as string) || null;
    const department = (body.department as string) || null;
    const authorId = body.authorId as string | null;

    // Update user record
    const { error } = await supabase
      .from("users")
      .update({ country, city, state, hospital, department })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Also update the author record if linked
    if (authorId) {
      const admin = createAdminClient();
      await (admin as any)
        .from("authors")
        .update({ country, city, hospital, department })
        .eq("id", authorId);
    }

    return NextResponse.json({ ok: true });
  }

  // ── Step: geo ──
  if (step === "geo") {
    const country = (body.country as string) || null;
    const city = (body.city as string) || null;
    const state = (body.state as string) || null;
    const hospital = (body.hospital as string) || null;

    const { error } = await supabase
      .from("users")
      .update({ country, city, state, hospital })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Step: complete ──
  if (step === "complete") {
    const subspecialties = body.subspecialties as string[] | undefined;

    // Validate max 3 subspecialties
    if (subspecialties && subspecialties.length > 3) {
      return NextResponse.json({ ok: false, error: "Max 3 subspecialties allowed" }, { status: 400 });
    }

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
