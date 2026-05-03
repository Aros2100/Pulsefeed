import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoWeekSaturday } from "@/lib/newsletter/send";
import NewsletterPreviewClient from "./NewsletterPreviewClient";

export default async function NewsletterPreviewPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year")
    .eq("id", issueId)
    .single();

  if (error || !edition) notFound();

  const saturday = isoWeekSaturday(edition.week_number, edition.year);
  const saturdayLabel = saturday.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <NewsletterPreviewClient
      editionId={issueId}
      weekNumber={edition.week_number}
      year={edition.year}
      saturdayLabel={saturdayLabel}
    />
  );
}
