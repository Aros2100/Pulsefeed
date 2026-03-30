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
    specialty:   z.string().refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v)),
    module:      z.string().default("specialty_tag"),
    // Accept either "prompt" (legacy) or "prompt_text" (new)
    prompt:      z.string().min(10).optional(),
    prompt_text: z.string().min(10).optional(),
    notes:       z.string().max(500).optional(),
    // When activate=true: deactivate all existing, insert new as active=true
    activate:    z.boolean().default(false),
  }).refine((d) => !!(d.prompt ?? d.prompt_text), { message: "prompt or prompt_text is required" });

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, module, notes, activate } = result.data;
  const promptText = result.data.prompt_text ?? result.data.prompt!;
  const admin = createAdminClient();

  // Auto-generate next version label
  const { count } = await admin
    .from("model_versions")
    .select("id", { count: "exact", head: true })
    .eq("specialty", specialty)
    .eq("module", module);

  const version = `v${(count ?? 0) + 1}`;

  if (activate) {
    // Deactivate all existing versions for this specialty+module
    await admin
      .from("model_versions")
      .update({ active: false })
      .eq("specialty", specialty)
      .eq("module", module);
  }

  if (activate && module === "condensation") {
    const { data: rejectedRows } = await admin
      .from("lab_decisions")
      .select("article_id")
      .eq("module", "condensation_text")
      .eq("decision", "rejected")
      .not("article_id", "is", null);

    const rejectedIds = (rejectedRows ?? [])
      .map((r) => r.article_id)
      .filter((id): id is string => !!id);

    if (rejectedIds.length > 0) {
      await admin
        .from("articles")
        .update({
          short_headline:          null,
          short_resume:            null,
          bottom_line:             null,
          pico_population:         null,
          pico_intervention:       null,
          pico_comparison:         null,
          pico_outcome:            null,
          sample_size:             null,
          condensed_model_version: null,
          condensed_at:            null,
        })
        .in("id", rejectedIds);
    }
  }

  const { data, error } = await admin
    .from("model_versions")
    .insert({
      specialty,
      module,
      version,
      prompt_text:  promptText,
      notes:        notes ?? null,
      generated_by: activate ? "auto" : "manual",
      ...(activate ? { active: true } : {}),
    })
    .select("id, version, activated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, version: data.version, activated_at: data.activated_at });
}
