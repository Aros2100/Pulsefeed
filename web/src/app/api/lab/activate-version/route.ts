import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const schema = z.object({
  id: z.string().uuid(),
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  module: z.string().default("specialty_tag"),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { id, specialty, module } = result.data;
  const admin = createAdminClient();

  // Deactivate all versions for this specialty+module
  const { error: deactivateError } = await admin
    .from("model_versions")
    .update({ active: false })
    .eq("specialty", specialty)
    .eq("module", module);

  if (deactivateError) {
    return NextResponse.json({ ok: false, error: deactivateError.message }, { status: 500 });
  }

  // Activate the selected version
  const { error: activateError } = await admin
    .from("model_versions")
    .update({ active: true })
    .eq("id", id);

  if (activateError) {
    return NextResponse.json({ ok: false, error: activateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
