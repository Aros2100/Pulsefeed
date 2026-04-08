import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export async function GET(req: NextRequest) {
  const specialty = req.nextUrl.searchParams.get("specialty") ?? ACTIVE_SPECIALTY;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_article_type_distribution", {
    p_specialty: specialty,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: (data ?? []).map((r: { article_type: string; n: number }) => ({
      article_type: r.article_type,
      n: Number(r.n),
    })),
  });
}
