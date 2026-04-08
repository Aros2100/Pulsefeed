export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import ScoreBadge from "@/components/ScoreBadge";
import ProfileClient from "./ProfileClient";
import { getSubspecialties } from "@/lib/lab/classification-options";
import MergeCheck from "./MergeCheck";

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #c8d0dc",
  borderRadius: "10px",
  overflow: "hidden",
  marginBottom: "28px",
};

const cardHeaderStyle: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  borderBottom: "1px solid #c8d0dc",
  padding: "10px 24px",
};

const cardHeaderLabel: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.09em",
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  fontWeight: 500,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", letterSpacing: "0.09em", color: "var(--color-text-secondary)", textTransform: "uppercase", fontWeight: 500, marginTop: "28px", marginBottom: "10px" }}>
      {children}
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, title, specialty_slugs, author_id, avatar_url, is_public, email_notifications, role_type, subspecialties, country, city, state, hospital, department")
    .eq("id", user.id)
    .single();

  const specialtySlugs: string[]       = profile?.specialty_slugs ?? [];
  const subspecialtiesList = await getSubspecialties(ACTIVE_SPECIALTY);
  const specialtyLabels: Record<string, string>                = {};

  type ArticleRow = {
    id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    news_value: number | null;
    evidence_score: number | null;
  };
  type AuthorArticleRow = { position: number; articles: ArticleRow };

  // Parallel: article count + author city/country + publications + first article date
  let articleCount    = 0;
  let authorCity:    string | null = null;
  let authorCountry: string | null = null;
  let myPublications: AuthorArticleRow[] = [];
  let firstArticleDate: string | null = null;
  let latestArticleDate: string | null = null;

  if (profile?.author_id) {
    const [{ count }, { data: authorRow }, { data: pubData }, { data: firstDateData }] = await Promise.all([
      supabase
        .from("article_authors")
        .select("*", { count: "exact", head: true })
        .eq("author_id", profile.author_id),
      supabase
        .from("authors")
        .select("city, country")
        .eq("id", profile.author_id)
        .single(),
      supabase
        .from("article_authors")
        .select("position, articles(id, title, journal_abbr, published_date, news_value, evidence_score)")
        .eq("author_id", profile.author_id)
        .limit(20),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("article_authors")
        .select("articles!inner(published_date)")
        .eq("author_id", profile.author_id)
        .order("published_date", { referencedTable: "articles", ascending: true })
        .limit(1),
    ]);
    articleCount  = count ?? 0;
    authorCity    = authorRow?.city    ?? null;
    authorCountry = authorRow?.country ?? null;
    if (pubData) {
      myPublications = (pubData as unknown as AuthorArticleRow[]).sort((a, b) => {
        const da = a.articles.published_date ?? "";
        const db = b.articles.published_date ?? "";
        return db.localeCompare(da);
      });
    }
    firstArticleDate = (firstDateData?.[0]?.articles as { published_date: string | null } | null)?.published_date ?? null;
    latestArticleDate = myPublications[0]?.articles.published_date ?? null;
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "var(--color-text-primary)", minHeight: "100vh" }}>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "22px", fontWeight: 500, color: "var(--color-text-primary)" }}>My profile</div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "3px" }}>Manage your account, preferences, and publications</div>
        </div>

        {/* Hero + Account + Privacy are client-rendered */}
        <ProfileClient
          email={user.email ?? ""}
          initialName={profile?.name || (user.user_metadata?.name as string) || ""}
          initialTitle={profile?.title ?? ""}
          initialSpecialtySlugs={specialtySlugs}
          initialIsPublic={profile?.is_public ?? false}
          initialEmailNotifications={profile?.email_notifications ?? true}
          articleCount={articleCount}
          specialtyLabels={specialtyLabels}
          roleType={profile?.role_type ?? null}
          authorCity={authorCity}
          authorCountry={authorCountry}
          initialSubspecialties={Array.isArray(profile?.subspecialties) ? (profile.subspecialties as string[]) : []}
          initialCountry={profile?.country ?? authorCountry}
          initialCity={profile?.city ?? authorCity}
          initialState={profile?.state ?? null}
          initialHospital={profile?.hospital ?? null}
          initialDepartment={profile?.department ?? null}
          authorId={profile?.author_id ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          displayName={profile?.name || (user.user_metadata?.name as string | undefined) || user.email || "?"}
          firstArticleDate={firstArticleDate}
          latestArticleDate={latestArticleDate}
          subspecialties={subspecialtiesList}
        />

        {/* Author Profile */}
        <SectionLabel>Author Profile</SectionLabel>
        {profile?.author_id ? (
          <div style={{ ...card, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>
              {articleCount} publications indexed
            </span>
            <Link href="/profile/link-author" style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 600, textDecoration: "none" }}>
              Change →
            </Link>
          </div>
        ) : (
          <div style={{ border: "1.5px dashed var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px 20px", background: "var(--color-background-primary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Are you a published author?</div>
            <Link href="/profile/link-author" style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 600, textDecoration: "none" }}>
              Link your profile →
            </Link>
          </div>
        )}

        {/* Merge candidates */}
        {profile?.author_id && (
          <>
            <SectionLabel>Possible duplicates</SectionLabel>
            <div style={card}>
              <div style={{ padding: "16px 24px" }}>
                <MergeCheck />
              </div>
            </div>
          </>
        )}

        {/* My Publications */}
        {profile?.author_id && (
          <div style={{ marginTop: "28px" }}>
            <SectionLabel>My Publications</SectionLabel>
            <div style={card}>
              <div style={{ ...cardHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={cardHeaderLabel}>Your indexed articles</span>
                {articleCount > 0 && (
                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    Showing {myPublications.length} of {articleCount}
                  </span>
                )}
              </div>
              {myPublications.length === 0 ? (
                <div style={{ padding: "24px", fontSize: "14px", color: "var(--color-text-secondary)" }}>
                  No publications found for your linked author profile.
                </div>
              ) : (
                <>
                  {myPublications.map((row, i) => (
                    <div
                      key={row.articles.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 24px",
                        borderTop: i === 0 ? undefined : "0.5px solid var(--color-border-tertiary)",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Link
                          href={`/articles/${row.articles.id}`}
                          style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", textDecoration: "none" }}
                        >
                          {row.articles.title}
                        </Link>
                        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                          {[row.articles.journal_abbr, row.articles.published_date?.slice(0, 7)].filter(Boolean).join(" · ")}
                          {" · "}{ordinal(row.position)} author
                        </div>
                      </div>
                      <div style={{ marginLeft: "16px", flexShrink: 0 }}>
                        {row.articles.evidence_score != null && <ScoreBadge score={row.articles.evidence_score} />}
                      </div>
                    </div>
                  ))}
                  {articleCount > 20 && profile?.author_id && (
                    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "12px 24px" }}>
                      <Link href={`/authors/${profile.author_id}`} style={{ fontSize: "13px", color: "var(--color-text-secondary)", textDecoration: "none", fontWeight: 500 }}>
                        Show all {articleCount} publications →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
