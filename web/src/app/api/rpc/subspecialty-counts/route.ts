import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ counts: [] }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const specialty = params.get("specialty") ?? ACTIVE_SPECIALTY;
  const subspecialties = params.getAll("sub[]");

  if (subspecialties.length === 0) {
    return NextResponse.json({ counts: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "get_subspecialty_article_counts",
    { p_specialty: specialty, p_subspecialties: subspecialties },
  );

  if (error) return NextResponse.json({ counts: [] }, { status: 500 });

  return NextResponse.json({ counts: data ?? [] });
}
