import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("author_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.author_id) {
    return NextResponse.json({ ok: false, error: "No author profile linked" }, { status: 400 });
  }

  const { data: primary } = await admin
    .from("authors")
    .select("id, display_name, display_name_normalized, orcid, openalex_id")
    .eq("id", userRow.author_id)
    .single();

  if (!primary) {
    return NextResponse.json({ ok: false, error: "Primary author not found" }, { status: 400 });
  }

  const orParts: string[] = [];
  if (primary.display_name_normalized) orParts.push(`display_name_normalized.eq.${primary.display_name_normalized}`);
  if (primary.orcid) orParts.push(`orcid.eq.${primary.orcid}`);
  if (primary.openalex_id) orParts.push(`openalex_id.eq.${primary.openalex_id}`);

  if (orParts.length === 0) {
    return NextResponse.json({ ok: true, candidates: [] });
  }

  const { data: candidates } = await admin
    .from("authors")
    .select("id, display_name, country, state, city, hospital, department, openalex_id, orcid, article_count")
    .neq("id", primary.id)
    .is("deleted_at", null)
    .or(orParts.join(","));

  return NextResponse.json({ ok: true, candidates: candidates ?? [] });
}
