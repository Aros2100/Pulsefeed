import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name:                z.string().optional(),
  specialty_slugs:     z.array(z.string()).optional(),
  is_public:           z.boolean().optional(),
  email_notifications: z.boolean().optional(),
});

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

  // Strip undefined values so we only update what was explicitly sent
  const updateData = Object.fromEntries(
    Object.entries(result.data).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields provided" }, { status: 400 });
  }

  const { error } = await supabase.from("users").update(updateData).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  revalidatePath("/profile");
  return NextResponse.json({ ok: true });
}
