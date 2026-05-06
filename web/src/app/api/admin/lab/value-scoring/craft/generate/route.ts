import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CRAFT_MODULE_KEY, ARTICLE_TYPE_TARGETS, QUALIFICATION_FIELDS,
} from "@/lib/lab/value-scoring/craft-config";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve module id
  const { data: mod, error: modErr } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (modErr || !mod) {
    return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });
  }
  if (mod.phase !== "sample") {
    return NextResponse.json({ ok: false, error: "Module is not in sample phase" }, { status: 409 });
  }

  const moduleId: string = mod.id;

  // Check if candidates already exist (generate is only allowed from empty state)
  const { count: existing } = await admin
    .from("lab_value_sample_candidates")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);

  if ((existing ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: "Sample already generated" }, { status: 409 });
  }

  // Qualify and sample per article_type
  let totalInserted = 0;

  for (const [articleType, target] of Object.entries(ARTICLE_TYPE_TARGETS)) {
    let query = admin
      .from("articles")
      .select("id")
      .eq("article_type", articleType)
      .contains("specialty_tags", [CRAFT_MODULE_KEY.specialty]);

    for (const field of QUALIFICATION_FIELDS) {
      query = query.not(field, "is", null);
    }

    const { data: pool } = await query;
    if (!pool || pool.length === 0) continue;

    const selected = shuffle(pool as { id: string }[]).slice(0, target);
    if (selected.length === 0) continue;

    const rows = selected.map(a => ({
      module_id:       moduleId,
      prod_article_id: a.id,
      article_type:    articleType,
    }));

    await admin.from("lab_value_sample_candidates").insert(rows);
    totalInserted += rows.length;
  }

  return NextResponse.json({ ok: true, inserted: totalInserted });
}
