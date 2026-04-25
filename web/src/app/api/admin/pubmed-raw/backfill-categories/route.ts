import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { categorizeDiff } from "@/lib/import/article-import/categorize-diff";

const BATCH = 100;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  // Fetch all diffs with null category
  const all: { id: string; field: string; db_value: string | null; xml_value: string | null }[] = [];
  let page = 0;
  for (;;) {
    const { data, error } = await a
      .from("article_pubmed_diffs")
      .select("id, field, db_value, xml_value")
      .is("category", null)
      .range(page * BATCH, (page + 1) * BATCH - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    all.push(...((data ?? []) as typeof all));
    if (!data || data.length < BATCH) break;
    page++;
  }

  if (all.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  let updated = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    await Promise.all(
      batch.map((row) => {
        const field = (row.field === "title" || row.field === "abstract") ? row.field : "abstract";
        const category = categorizeDiff(field, row.db_value, row.xml_value);
        return a
          .from("article_pubmed_diffs")
          .update({ category })
          .eq("id", row.id);
      })
    );
    updated += batch.length;
  }

  return NextResponse.json({ ok: true, updated });
}
