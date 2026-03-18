import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  activeIds: z.array(z.string().uuid()),
  disableIds: z.array(z.string().uuid()),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { activeIds, disableIds } = parsed.data;

  // Activate checked terms
  if (activeIds.length > 0) {
    const { error } = await admin
      .from("tagging_rules")
      .update({
        status: "active",
        activated_at: now,
        activated_by: auth.userId,
      })
      .in("id", activeIds);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
  }

  // Disable unchecked terms — set to 'disabled' for terms that were
  // previously active, or revert to 'tracking' for terms under threshold.
  // For simplicity we set all to 'disabled' since admin explicitly unchecked them.
  if (disableIds.length > 0) {
    const { error } = await admin
      .from("tagging_rules")
      .update({ status: "disabled" })
      .in("id", disableIds);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
