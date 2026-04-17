import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default async function NewsletterIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; year?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  const now = new Date();
  const { week: weekParam, year: yearParam } = await searchParams;
  const targetWeek = weekParam ? parseInt(weekParam) : getISOWeek(now);
  const targetYear = yearParam ? parseInt(yearParam) : now.getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Look for existing edition for this week
  const { data: existing } = await admin
    .from("newsletter_editions")
    .select("id")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("week_number", targetWeek)
    .eq("year", targetYear)
    .single();

  if (existing?.id) {
    redirect(`/admin/newsletter/${existing.id}`);
  }

  // None found — create one and redirect
  const { data: created, error } = await admin
    .from("newsletter_editions")
    .insert({
      week_number: targetWeek,
      year: targetYear,
      specialty: ACTIVE_SPECIALTY,
      status: "draft",
      content: {},
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !created?.id) throw new Error(error?.message ?? "Failed to create edition");

  redirect(`/admin/newsletter/${created.id}`);
}
