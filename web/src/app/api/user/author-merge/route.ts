import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  slave_ids: z.array(z.string().uuid()).min(1),
  resolved_fields: z.object({
    country:    z.string().nullable().optional(),
    city:       z.string().nullable().optional(),
    state:      z.string().nullable().optional(),
    hospital:   z.string().nullable().optional(),
    department: z.string().nullable().optional(),
  }).optional().default({}),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("author_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.author_id) {
    return NextResponse.json({ ok: false, error: "No author profile linked" }, { status: 400 });
  }

  const { slave_ids, resolved_fields } = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).rpc("merge_authors_user", {
    p_user_id:        user.id,
    p_primary_id:     userRow.author_id,
    p_slave_ids:      slave_ids,
    p_resolved_fields: resolved_fields ?? {},
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
