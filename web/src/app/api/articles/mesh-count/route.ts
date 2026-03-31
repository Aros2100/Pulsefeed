export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const subspecialty = params.get("subspecialty");
  const meshTerms = params.getAll("mesh[]");
  const yearRange = params.get("year_range") ?? "2";

  if (meshTerms.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("count_articles_by_mesh_terms", {
    p_subspecialty: subspecialty ?? null,
    p_mesh_terms: meshTerms,
    p_year_range: yearRange,
  });

  if (error) return NextResponse.json({ count: 0 }, { status: 500 });

  return NextResponse.json({ count: Number(data) ?? 0 });
}
