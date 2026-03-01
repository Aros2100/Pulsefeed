import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "subscriber")
    .order("subscribed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const supabase = await createClient();
  const body = await req.json();

  const { email, name, status, source, frequency, email_format, specialty_slugs, notes } = body;

  if (!email) {
    return NextResponse.json({ error: "E-mail er påkrævet" }, { status: 400 });
  }

  // Check duplicate
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) {
    return NextResponse.json({ error: "E-mail findes allerede" }, { status: 409 });
  }

  // Create auth user first (so id exists in auth.users)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("users")
    .update({
      name: name ?? "",
      status: status ?? "active",
      source: source ?? "manual",
      frequency: frequency ?? "weekly",
      email_format: email_format ?? "full",
      specialty_slugs: specialty_slugs ?? [],
      notes: notes ?? "",
      role: "subscriber",
    })
    .eq("id", authData.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
