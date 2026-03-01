import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const patchSchema = z.object({
  name: z.string().optional(),
  status: z.enum(["active", "unsubscribed", "paused"]).optional(),
  source: z.enum(["website", "referral", "manual", "import"]).optional(),
  specialty_slugs: z.array(z.string()).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  email_format: z.enum(["full", "headlines"]).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .update(result.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(user);
}
