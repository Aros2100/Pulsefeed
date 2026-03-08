import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

interface AuthorRow {
  id: string;
  display_name: string;
  affiliations: string[] | null;
  article_count: number | null;
  orcid: string | null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data: allAuthors, error } = await admin
    .from("authors")
    .select("id, display_name, affiliations, article_count, orcid");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Group by display_name in JS
  const map = new Map<string, AuthorRow[]>();
  for (const a of (allAuthors ?? []) as AuthorRow[]) {
    const key = a.display_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  const groups = Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 100)
    .map(([displayName, authors]) => ({
      display_name: displayName,
      count: authors.length,
      authors,
    }));

  return NextResponse.json({ ok: true, groups });
}
