import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const schema = z.object({
  role: z.enum(["admin", "subscriber"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { role } = result.data;
  const admin = createAdminClient();

  const { error: publicError } = await admin
    .from("users")
    .update({ role })
    .eq("id", id);

  if (publicError) {
    return NextResponse.json({ ok: false, error: publicError.message }, { status: 500 });
  }

  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { role: role === "admin" ? "admin" : null },
  });

  if (authError) {
    return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
