import type { SupabaseClient } from "@supabase/supabase-js";

export async function autoSelectAndFinally(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any,
  editionId: string
): Promise<string | null> {
  const { data } = await admin
    .from("articles")
    .select("id")
    .eq("and_finally_candidate", true)
    .is("and_finally_used_in_edition_id", null)
    .order("pubmed_indexed_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  await admin
    .from("newsletter_editions")
    .update({ and_finally_article_id: data.id })
    .eq("id", editionId);

  return data.id as string;
}
