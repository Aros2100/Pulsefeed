import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const schema = z.object({
    specialty: z.string().refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v)),
    module: z.string().default("specialty_tag"),
    prompt: z.string().min(10),
    notes: z.string().max(500).optional(),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, module, prompt, notes } = result.data;
  const admin = createAdminClient();

  // Auto-generate next version label
  const { count } = await admin
    .from("model_versions")
    .select("id", { count: "exact", head: true })
    .eq("specialty", specialty)
    .eq("module", module);

  const version = `v${(count ?? 0) + 1}`;

  const { data, error } = await admin
    .from("model_versions")
    .insert({ specialty, module, version, prompt_text: prompt, notes: notes ?? null, generated_by: "manual" })
    .select("id, version, activated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, version: data.version, activated_at: data.activated_at });
}
