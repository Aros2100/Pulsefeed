import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterReviewClient from "./NewsletterReviewClient";

export default async function NewsletterReviewPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, content")
    .eq("id", issueId)
    .single();

  if (editionError || !edition) notFound();

  const { data: subspecialties } = await admin
    .from("subspecialties")
    .select("id, name, sort_order")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true)
    .order("sort_order");

  const { data: editionArticles } = await admin
    .from("newsletter_edition_articles")
    .select("id, article_id, subspecialty, sort_order, is_global")
    .eq("edition_id", issueId)
    .order("sort_order");

  const articleIds = ((editionArticles ?? []) as { article_id: string }[]).map((ea) => ea.article_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articleDetails: any[] = [];
  if (articleIds.length > 0) {
    const { data } = await admin
      .from("articles")
      .select("id, title, journal_abbr, pubmed_indexed_at, article_type, pubmed_id")
      .in("id", articleIds);
    articleDetails = data ?? [];
  }

  return (
    <NewsletterReviewClient
      edition={edition}
      subspecialties={subspecialties ?? []}
      editionArticles={editionArticles ?? []}
      articleDetails={articleDetails}
    />
  );
}
