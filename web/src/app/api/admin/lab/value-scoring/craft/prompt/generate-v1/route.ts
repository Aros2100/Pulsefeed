import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";
import { generatePromptV1FromPairwise } from "@/lib/lab/value-scoring/prompt-iteration";

// Loads ~500 pairs + reasons + rankings + ~10 articles and one Sonnet call.
export const maxDuration = 180;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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

  try {
    const suggestion = await generatePromptV1FromPairwise(admin, mod.id as string);
    return NextResponse.json({
      ok:          true,
      promptText:  suggestion.promptText,
      changeNotes: suggestion.changeNotes,
      summary:     suggestion.summary,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
