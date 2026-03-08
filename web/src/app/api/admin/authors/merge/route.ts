import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const mergeSchema = z.object({
  masterId: z.string().uuid(),
  duplicateIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { masterId, duplicateIds } = parsed.data;

  if (duplicateIds.includes(masterId)) {
    return NextResponse.json(
      { ok: false, error: "masterId cannot be in duplicateIds" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let articlesRelinked = 0;

  // --- For each duplicate, move article_authors to master ---
  for (const dupId of duplicateIds) {
    const { data: links } = await admin
      .from("article_authors")
      .select("article_id")
      .eq("author_id", dupId);

    if (!links || links.length === 0) continue;

    for (const link of links) {
      const { error: updateErr } = await admin
        .from("article_authors")
        .update({ author_id: masterId })
        .eq("author_id", dupId)
        .eq("article_id", link.article_id);

      if (updateErr) {
        // Unique constraint conflict → article already linked to master, delete instead
        await admin
          .from("article_authors")
          .delete()
          .eq("author_id", dupId)
          .eq("article_id", link.article_id);
      }
      articlesRelinked++;
    }
  }

  // --- Merge affiliations ---
  const { data: masterAuthor } = await admin
    .from("authors")
    .select("affiliations, orcid")
    .eq("id", masterId)
    .single();

  const masterAffiliations: string[] = (masterAuthor?.affiliations as string[]) ?? [];
  let masterOrcid: string | null = (masterAuthor?.orcid as string) ?? null;

  for (const dupId of duplicateIds) {
    const { data: dup } = await admin
      .from("authors")
      .select("affiliations, orcid")
      .eq("id", dupId)
      .single();

    if (dup?.affiliations) {
      for (const a of dup.affiliations as string[]) {
        if (!masterAffiliations.includes(a)) {
          masterAffiliations.push(a);
        }
      }
    }

    if (!masterOrcid && dup?.orcid) {
      masterOrcid = dup.orcid as string;
    }
  }

  // --- Recount articles ---
  const { count: newCount } = await admin
    .from("article_authors")
    .select("*", { count: "exact", head: true })
    .eq("author_id", masterId);

  // --- Update master ---
  await admin
    .from("authors")
    .update({
      affiliations: masterAffiliations,
      orcid: masterOrcid,
      article_count: newCount ?? 0,
    })
    .eq("id", masterId);

  // --- Delete duplicates ---
  await admin
    .from("authors")
    .delete()
    .in("id", duplicateIds);

  return NextResponse.json({
    ok: true,
    merged: duplicateIds.length,
    articlesRelinked,
  });
}
