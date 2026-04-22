import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterSendClient from "./NewsletterSendClient";

export default async function NewsletterSendPage({ params }: { params: Promise<{ issueId: string }> }) {
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

  const { count: recipientCount } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .contains("specialty_slugs", [ACTIVE_SPECIALTY]);

  return (
    <NewsletterSendClient
      edition={edition}
      recipientCount={recipientCount ?? 0}
    />
  );
}
