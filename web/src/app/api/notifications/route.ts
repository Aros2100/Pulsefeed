import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifications, error } = await (supabase as any)
    .from("notifications")
    .select("id, type, title, message, link, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true, notifications: notifications ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = z.object({ ids: z.array(z.string().uuid()).optional() }).safeParse(body);
  if (!result.success) return NextResponse.json({ ok: false, error: "Invalid ids" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any).from("notifications").update({ read: true }).eq("user_id", user.id);
  if (result.data.ids?.length) query = query.in("id", result.data.ids);

  const { error } = await query;
  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
