import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name:                z.string().optional(),
  title:               z.string().optional(),
  specialty_slugs:     z.array(z.string()).optional(),
  is_public:           z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  subspecialties:      z.array(z.string()).max(4).optional(), // mandatory + max 3 elective
  country:             z.string().nullable().optional(),
  city:                z.string().nullable().optional(),
  state:               z.string().nullable().optional(),
  hospital:            z.string().nullable().optional(),
  department:          z.string().nullable().optional(),
});

const GEO_FIELDS = ["country", "city", "state", "hospital", "department"] as const;

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

  const { error, data } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id)
    .select("author_id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Sync geo fields to authors table if user has a linked author
  const authorId = data?.[0]?.author_id as string | null;
  const hasGeoUpdate = GEO_FIELDS.some((f) => f in updateData);
  if (authorId && hasGeoUpdate) {
    const geoUpdate: Record<string, string | null> = {};
    for (const f of GEO_FIELDS) {
      if (f in updateData) geoUpdate[f] = updateData[f] as string | null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    await admin.from("authors").update(geoUpdate).eq("id", authorId);
  }

  revalidatePath("/profile");
  return NextResponse.json({ ok: true });
}
