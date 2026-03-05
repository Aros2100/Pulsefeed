import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name:                z.string().min(1).optional(),
  specialty_slugs:     z.array(z.string()).optional(),
  is_public:           z.boolean().optional(),
  email_notifications: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "No fields provided" });

export async function PATCH(request: NextRequest) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("users").update(result.data).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: (error as { message: string }).message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
