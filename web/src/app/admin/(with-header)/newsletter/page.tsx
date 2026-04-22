import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterOverviewClient from "./NewsletterOverviewClient";

export default async function NewsletterIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: editions } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, content")
    .eq("specialty", ACTIVE_SPECIALTY)
    .order("year", { ascending: false })
    .order("week_number", { ascending: false });

  const editionList = editions ?? [];

  // Fetch article counts for all editions in one query
  let countMap: Record<string, number> = {};
  if (editionList.length > 0) {
    const ids = editionList.map((e: { id: string }) => e.id);
    const { data: counts } = await admin
      .from("newsletter_edition_articles")
      .select("edition_id")
      .in("edition_id", ids);

    if (counts) {
      for (const row of counts as { edition_id: string }[]) {
        countMap[row.edition_id] = (countMap[row.edition_id] ?? 0) + 1;
      }
    }
  }

  const enriched = editionList.map((e: { id: string; week_number: number; year: number; status: string; content: Record<string, unknown> | null }) => ({
    ...e,
    article_count: countMap[e.id] ?? 0,
  }));

  return <NewsletterOverviewClient editions={enriched} />;
}
