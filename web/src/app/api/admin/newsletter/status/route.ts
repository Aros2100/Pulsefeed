import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isoWeekSunday } from "@/lib/newsletter/dates";

const schema = z.object({
  id:     z.string().min(1),
  status: z.enum(["draft", "approved", "sent"]),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { id, status } = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };

  if (status === "approved") {
    const { count: globalCount } = await admin
      .from("newsletter_edition_articles")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", id)
      .eq("is_global", true);

    if ((globalCount ?? 0) < 6) {
      return NextResponse.json(
        { ok: false, error: `At least 6 global articles required (currently ${globalCount ?? 0})` },
        { status: 400 }
      );
    }

    const { data: current } = await admin
      .from("newsletter_editions")
      .select("week_number, year, published_at")
      .eq("id", id)
      .single();

    if (current && !current.published_at) {
      update.published_at = isoWeekSunday(current.week_number, current.year).toISOString();
    }
  }

  const { error } = await admin
    .from("newsletter_editions")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
