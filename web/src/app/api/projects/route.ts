import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projects, error } = await (supabase as any)
    .from("projects")
    .select("id, name, created_at, saved_articles(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    projects: ((projects ?? []) as { id: string; name: string; created_at: string; saved_articles: unknown[] }[]).map((p) => ({
      id:            p.id,
      name:          p.name,
      created_at:    p.created_at,
      article_count: Array.isArray(p.saved_articles) ? p.saved_articles.length : 0,
    })),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = z.object({ name: z.string().min(1).max(100) }).safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, error } = await (supabase as any)
    .from("projects")
    .insert({ user_id: user.id, name: result.data.name })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true, project });
}
