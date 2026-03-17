import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

interface DupGroup {
  author_ids: string[];
  display_names: string[];
  group_size: number;
}

interface RepAuthor {
  id: string;
  display_name: string | null;
  country: string | null;
  city: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json() as {
    p_match_country?: boolean;
    p_match_state?: boolean;
    p_match_city?: boolean;
    p_match_hospital?: boolean;
    p_country?: string | null;
    p_last_name_chars?: number;
    p_max_group_size?: number;
  };

  const {
    p_match_country  = true,
    p_match_state    = false,
    p_match_city     = true,
    p_match_hospital = false,
    p_country        = null,
    p_last_name_chars = 4,
    p_max_group_size  = 8,
  } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: groups, error } = await admin.rpc("find_author_duplicates", {
    p_match_country,
    p_match_state,
    p_match_city,
    p_match_hospital,
    p_country,
    p_last_name_chars,
    p_max_group_size,
    p_exact_lastname: false,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const result = (groups as DupGroup[]) ?? [];

  // Batch fetch representative author info (first author in each group)
  const repIds = [...new Set(result.map((g) => g.author_ids[0]).filter(Boolean))];
  let repAuthors: RepAuthor[] = [];
  if (repIds.length > 0) {
    const { data: reps } = await admin
      .from("authors")
      .select("id, display_name, country, city")
      .in("id", repIds);
    repAuthors = (reps ?? []) as RepAuthor[];
  }

  return NextResponse.json({ ok: true, groups: result, repAuthors });
}
