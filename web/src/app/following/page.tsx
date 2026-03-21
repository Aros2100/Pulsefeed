export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowingPageClient from "./FollowingPageClient";

export default async function FollowingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch followed author IDs ordered by follow date
  const { data: follows } = await supabase
    .from("author_follows")
    .select("author_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const authorIds = (follows ?? [])
    .map((f) => f.author_id)
    .filter((id): id is string => id !== null);

  // Fetch author details (preserve follow-date order)
  let authors: {
    id: string;
    display_name: string | null;
    department: string | null;
    hospital: string | null;
    city: string | null;
    country: string | null;
    article_count: number | null;
    author_score: number | null;
  }[] = [];

  if (authorIds.length > 0) {
    const { data } = await supabase
      .from("authors")
      .select("id, display_name, department, hospital, city, country, article_count, author_score")
      .in("id", authorIds)
      .is("deleted_at", null);

    if (data) {
      type AuthorRow = typeof authors[0];
      const typedData = data as unknown as AuthorRow[];
      const map = Object.fromEntries(typedData.map((a) => [a.id, a]));
      authors = authorIds.map((id) => map[id]).filter(Boolean);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Following</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>Authors you follow</div>
        </div>

        {authors.length === 0 ? (
          <div style={{
            background: "#fff", borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            padding: "40px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: "14px", color: "#888", marginBottom: "16px" }}>
              You&apos;re not following any authors yet
            </div>
            <Link href="/authors" style={{ fontSize: "14px", color: "#E83B2A", fontWeight: 600, textDecoration: "none" }}>
              Browse authors →
            </Link>
          </div>
        ) : (
          <FollowingPageClient initialAuthors={authors} />
        )}

      </div>
    </div>
  );
}
