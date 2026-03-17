import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAuthorEvent } from "@/lib/author-events";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json() as {
    country?: string | null;
    city?: string | null;
    state?: string | null;
    hospital?: string | null;
    department?: string | null;
  };

  const admin = createAdminClient();

  const { error } = await admin
    .from("authors")
    .update({
      country:    body.country    ?? null,
      city:       body.city       ?? null,
      state:      body.state      ?? null,
      hospital:   body.hospital   ?? null,
      department: body.department ?? null,
      verified_by: "human",
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  void logAuthorEvent(id, "geo_updated", {
    country:    body.country    ?? null,
    city:       body.city       ?? null,
    state:      body.state      ?? null,
    institution: body.hospital  ?? null,
    source:     "human",
  });

  return NextResponse.json({ ok: true });
}
