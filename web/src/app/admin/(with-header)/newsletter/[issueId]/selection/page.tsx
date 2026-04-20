import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterSelectionClient from "./NewsletterSelectionClient";

function getWeekRange(week: number, year: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
  };
}

export default async function NewsletterSelectionPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status")
    .eq("id", issueId)
    .single();

  if (editionError || !edition) notFound();

  const { data: subspecialties } = await admin
    .from("subspecialties")
    .select("id, name, sort_order")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true)
    .order("sort_order");

  const { start: weekFrom, end: weekTo } = getWeekRange(edition.week_number, edition.year);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articleList } = await (admin as any).rpc("get_newsletter_articles", {
    p_specialty: ACTIVE_SPECIALTY,
    p_start: weekFrom,
    p_end: weekTo,
  });

  const { data: existingSelections } = await admin
    .from("newsletter_edition_articles")
    .select("article_id, subspecialty, sort_order")
    .eq("edition_id", issueId);

  return (
    <NewsletterSelectionClient
      edition={edition}
      subspecialties={subspecialties ?? []}
      articles={articleList ?? []}
      existingSelections={existingSelections ?? []}
    />
  );
}
