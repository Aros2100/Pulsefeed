import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import MergeClient from "./MergeClient";

const AUTHOR_SELECT = "id, display_name, country, state, city, hospital, department, openalex_id, orcid, article_count";

export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ candidate?: string }>;
}) {
  const { candidate: candidateId } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("author_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.author_id) redirect("/profile");

  if (!candidateId) notFound();

  const [{ data: primary }, { data: candidate }] = await Promise.all([
    admin
      .from("authors")
      .select(AUTHOR_SELECT)
      .eq("id", userRow.author_id)
      .single(),
    admin
      .from("authors")
      .select(AUTHOR_SELECT)
      .eq("id", candidateId)
      .is("deleted_at", null)
      .single(),
  ]);

  if (!primary || !candidate) notFound();

  type AuthorData = typeof primary;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <MergeClient primary={primary as AuthorData} candidate={candidate as AuthorData} />
    </div>
  );
}
