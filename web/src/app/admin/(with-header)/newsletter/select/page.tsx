import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterSelectClient from "./NewsletterSelectClient";

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default async function NewsletterSelectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (user.app_metadata?.role !== "admin") redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user.id)
    .single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];
  const specialtyLabel = specialtySlugs
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " "))
    .join(", ") || "All specialties";

  // Fetch articles from the last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("articles")
    .select("id, title, journal_abbr, published_date, authors, article_type, enriched_at, short_resume, abstract, pico, pubmed_id, volume, issue, imported_at")
    .eq("status", "approved")
    .gte("imported_at", twoWeeksAgo)
    .order("imported_at", { ascending: false })
    .limit(200);

  if (specialtySlugs.length > 0) {
    query = query.contains("specialty_tags", specialtySlugs);
  }

  const { data: articles } = await query;
  const weekNumber = getISOWeek(new Date());

  return (
    <NewsletterSelectClient
      articles={articles ?? []}
      specialtyLabel={specialtyLabel}
      weekNumber={weekNumber}
    />
  );
}
