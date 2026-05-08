import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  confirm_email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  // Confirmation: the email the user typed must match their actual email
  if (result.data.confirm_email !== user.email) {
    return NextResponse.json({ ok: false, error: "Email does not match your account." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Step 1: Anonymize personal data in a single transaction via RPC
  const { error: rpcError } = await admin.rpc("anonymize_user", { p_user_id: user.id });
  if (rpcError) {
    return NextResponse.json({ ok: false, error: `Anonymization failed: ${rpcError.message}` }, { status: 500 });
  }

  // Step 2: Delete the auth record (user can no longer log in)
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    // Anonymization succeeded but auth deletion failed — user is logged in to an empty profile.
    // Surface a clear error; manual cleanup required.
    console.error("[profile/delete] Auth deletion failed after anonymization:", authError.message, "user_id:", user.id);
    return NextResponse.json({
      ok: false,
      error: "Your data was removed but we could not complete account deletion. Please contact support at hello@pulsefeeds.com.",
    }, { status: 500 });
  }

  // Step 3: Sign the user out (best-effort — they're already deleted from auth)
  await supabase.auth.signOut().catch(() => null);

  return NextResponse.json({ ok: true });
}
