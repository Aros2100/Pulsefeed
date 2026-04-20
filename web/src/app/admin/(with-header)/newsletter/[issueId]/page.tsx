import { redirect } from "next/navigation";

export default async function NewsletterIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  redirect(`/admin/newsletter/${issueId}/selection`);
}
