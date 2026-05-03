import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterAiClient from "./NewsletterAiClient";

export default async function NewsletterIntroTextsPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, content, and_finally_article_id, and_finally_headline, and_finally_subheadline")
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
    .select("id, article_id, subspecialty, sort_order, is_global, global_sort_order, newsletter_headline, newsletter_subheadline")
    .eq("edition_id", issueId)
    .order("sort_order");

  const articleIds = ((editionArticles ?? []) as { article_id: string }[]).map((ea) => ea.article_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articleDetails: any[] = [];
  if (articleIds.length > 0) {
    const { data } = await admin
      .from("articles")
      .select("id, title, article_type, abstract, short_resume, subspecialty, pubmed_id, sari_subject, sari_action, sari_result, sari_implication")
      .in("id", articleIds);
    articleDetails = data ?? [];
  }

  let andFinallyArticle = null;
  if (edition.and_finally_article_id) {
    const { data } = await admin
      .from("articles")
      .select("id, title, article_type, abstract, short_resume, subspecialty, pubmed_id, sari_subject, sari_action, sari_result, sari_implication")
      .eq("id", edition.and_finally_article_id)
      .single();
    andFinallyArticle = data ?? null;
  }

  return (
    <NewsletterAiClient
      edition={edition}
      subspecialties={subspecialties ?? []}
      editionArticles={editionArticles ?? []}
      articleDetails={articleDetails}
      andFinallyArticle={andFinallyArticle}
    />
  );
}
