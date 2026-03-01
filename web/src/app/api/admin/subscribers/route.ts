import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("*")
    .order("subscribed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

const createSchema = z.object({
  email: z.string().email("Ugyldig e-mail"),
  name: z.string().optional(),
  status: z.enum(["active", "unsubscribed", "paused"]).default("active"),
  source: z.enum(["website", "referral", "manual", "import"]).default("manual"),
  specialty_slugs: z.array(z.string()).default([]),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).default("weekly"),
  email_format: z.enum(["full", "headlines"]).default("full"),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = createSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { email, name, ...profile } = result.data;
  const admin = createAdminClient();

  // Create the auth user (triggers handle_new_user → public.users row)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: name ?? "" },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Update the public.users row with the extra profile fields
  const { data: user, error: updateError } = await admin
    .from("users")
    .update({ name: name ?? "", ...profile })
    .eq("id", authData.user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(user, { status: 201 });
}
