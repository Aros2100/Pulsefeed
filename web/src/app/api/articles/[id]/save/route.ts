import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: articleId } = await params;

  let project_id: string | null = null;
  try {
    const body = await request.json() as { project_id?: string };
    project_id = body.project_id ?? null;
  } catch { /* no body */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("saved_articles").upsert(
    { user_id: user.id, article_id: articleId, project_id, saved_at: new Date().toISOString() },
    { onConflict: "user_id,article_id" }
  );

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: articleId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("saved_articles")
    .delete()
    .eq("user_id", user.id)
    .eq("article_id", articleId);

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: false });
}
