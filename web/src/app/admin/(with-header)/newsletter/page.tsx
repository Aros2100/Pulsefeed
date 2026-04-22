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

  const editionList: { id: string; week_number: number; year: number; status: "draft" | "approved" | "sent"; content: Record<string, unknown> | null }[] = editions ?? [];

  // Fetch all newsletter_edition_articles rows for all editions in one query
  let allEditionArticles: { edition_id: string; subspecialty: string | null; is_global: boolean }[] = [];
  if (editionList.length > 0) {
    const ids = editionList.map((e) => e.id);
    const { data } = await admin
      .from("newsletter_edition_articles")
      .select("edition_id, subspecialty, is_global")
      .in("edition_id", ids);
    allEditionArticles = data ?? [];
  }

  // Active subspecialty count (shared across editions)
  const { data: activeSubspecialties } = await admin
    .from("subspecialties")
    .select("name")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true);
  const activeSubspecialtyCount: number = (activeSubspecialties ?? []).length;

  // Build per-edition counts
  const countMap: Record<string, number> = {};
  const bySubspecialtyMap: Record<string, Record<string, number>> = {};
  const globalCountMap: Record<string, number> = {};

  for (const row of allEditionArticles) {
    const eid = row.edition_id;
    countMap[eid] = (countMap[eid] ?? 0) + 1;
    if (row.is_global) {
      globalCountMap[eid] = (globalCountMap[eid] ?? 0) + 1;
    }
    if (row.subspecialty) {
      if (!bySubspecialtyMap[eid]) bySubspecialtyMap[eid] = {};
      bySubspecialtyMap[eid][row.subspecialty] = (bySubspecialtyMap[eid][row.subspecialty] ?? 0) + 1;
    }
  }

  const enriched = editionList.map((e, idx) => {
    const articlesBySubspecialty = bySubspecialtyMap[e.id] ?? {};
    const globalCount = globalCountMap[e.id] ?? 0;
    const subspecialtiesWithArticles = Object.keys(articlesBySubspecialty);
    return {
      ...e,
      article_count: countMap[e.id] ?? 0,
      // Detailed props only for the current (first) edition
      articlesBySubspecialty: idx === 0 ? articlesBySubspecialty : {},
      globalCount:             idx === 0 ? globalCount : 0,
      subspecialtiesWithArticles: idx === 0 ? subspecialtiesWithArticles : [],
      activeSubspecialtyCount,
    };
  });

  return <NewsletterOverviewClient editions={enriched} />;
}
