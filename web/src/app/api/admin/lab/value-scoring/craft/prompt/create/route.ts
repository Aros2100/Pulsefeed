import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, MIN_PAIRS_FOR_PROMPT } from "@/lib/lab/value-scoring/craft-config";
import { createPromptVersion, getDecidedPairCount } from "@/lib/lab/value-scoring/prompt-versions";

const schema = z.object({
  promptText:     z.string().min(1, "Prompt text is required"),
  changeNotes:    z.string().optional(),
  parentPromptId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { promptText, changeNotes, parentPromptId } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();
  if (!mod) return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });

  const decided = await getDecidedPairCount(admin, mod.id as string);
  if (decided < MIN_PAIRS_FOR_PROMPT) {
    return NextResponse.json({
      ok: false,
      error: `Need at least ${MIN_PAIRS_FOR_PROMPT} decided pairs before creating a prompt (have ${decided})`,
    }, { status: 409 });
  }

  // If a parent was specified, verify it belongs to the same module
  if (parentPromptId) {
    const { data: parent } = await admin
      .from("lab_value_prompts")
      .select("module_id")
      .eq("id", parentPromptId)
      .maybeSingle();
    if (!parent || (parent as { module_id: string }).module_id !== mod.id) {
      return NextResponse.json({ ok: false, error: "Parent prompt not found in this module" }, { status: 400 });
    }
  }

  try {
    const created = await createPromptVersion(
      admin,
      mod.id as string,
      promptText,
      changeNotes ?? null,
      parentPromptId ?? null,
    );
    return NextResponse.json({ ok: true, id: created.id, version: created.version });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
