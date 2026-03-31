import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authors: [] }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const subspecialty = params.get("subspecialty");

  const { data: profile } = await supabase
    .from("users")
    .select("country")
    .eq("id", user.id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_suggested_authors", {
    p_user_id: user.id,
    p_user_country: (profile?.country as string | null) ?? null,
    p_subspecialty: subspecialty ?? null,
  });

  if (error) return NextResponse.json({ authors: [] }, { status: 500 });

  return NextResponse.json({ authors: data ?? [] });
}
