import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, QUALIFICATION_FIELDS } from "@/lib/lab/value-scoring/craft-config";

const schema = z.object({ candidateId: z.string().uuid() });

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }
  const { candidateId } = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve module id
  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod || mod.phase !== "sample") {
    return NextResponse.json({ ok: false, error: "Module not in sample phase" }, { status: 409 });
  }
  const moduleId: string = mod.id;

  // Read the candidate to be replaced
  const { data: candidate } = await admin
    .from("lab_value_sample_candidates")
    .select("id, article_type, prod_article_id")
    .eq("id", candidateId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
  }
  const articleType: string = candidate.article_type;

  // Get all current candidate prod_article_ids (excluding the one being replaced)
  const { data: currentCandidates } = await admin
    .from("lab_value_sample_candidates")
    .select("prod_article_id")
    .eq("module_id", moduleId)
    .neq("id", candidateId);

  const excludedIds = (currentCandidates ?? []).map((c: { prod_article_id: string }) => c.prod_article_id);

  // Find replacement pool
  let query = admin
    .from("articles")
    .select("id")
    .eq("article_type", articleType)
    .contains("specialty_tags", [CRAFT_MODULE_KEY.specialty]);

  for (const field of QUALIFICATION_FIELDS) {
    query = query.not(field, "is", null);
  }

  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }

  const { data: pool } = await query;

  if (!pool || pool.length === 0) {
    // Delete without replacement — no articles left of this type
    await admin.from("lab_value_sample_candidates").delete().eq("id", candidateId);
    return NextResponse.json({
      ok: true,
      replaced: false,
      warning: `No more qualifying articles of type "${articleType}" available in prod.`,
    });
  }

  // Pick a random replacement
  const [replacement] = shuffle(pool as { id: string }[]);

  // Delete old, insert new (not transactional but acceptable)
  await admin.from("lab_value_sample_candidates").delete().eq("id", candidateId);
  const { data: newRow, error: insertErr } = await admin
    .from("lab_value_sample_candidates")
    .insert({ module_id: moduleId, prod_article_id: replacement.id, article_type: articleType })
    .select("id, article_type, prod_article_id")
    .single();

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, replaced: true, newCandidateId: (newRow as { id: string }).id });
}
