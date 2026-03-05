import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true }); // silent for unauthenticated

  const { id: articleId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  await db.from("reading_history").upsert(
    { user_id: user.id, article_id: articleId, visited_at: new Date().toISOString() },
    { onConflict: "user_id,article_id" }
  );

  // Trim to 100 most recent
  const { data: rows } = await db
    .from("reading_history")
    .select("id")
    .eq("user_id", user.id)
    .order("visited_at", { ascending: true });

  if (rows && rows.length > 100) {
    const toDelete = (rows as { id: string }[]).slice(0, rows.length - 100).map((r) => r.id);
    await db.from("reading_history").delete().in("id", toDelete);
  }

  return NextResponse.json({ ok: true });
}
