import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { NewsletterArticle, NewsletterContent } from "@/lib/newsletter/send";
import KPIOverviewV1 from "@/components/KPIOverviewV1";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";


function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function ArticleBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: "11px",
      fontWeight: 600,
      color: "#E83B2A",
      background: "#fef2f2",
      borderRadius: "4px",
      padding: "2px 7px",
      letterSpacing: "0.02em",
    }}>
      {type}
    </span>
  );
}

function ArticleCard({ article }: { article: NewsletterArticle }) {
  const pubmedUrl = article.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`
    : null;

  const meta = [article.journal_abbr, formatDate(article.published_date)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      border: "1px solid #e5e9f0",
      padding: "18px 20px",
      marginBottom: "10px",
    }}>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4, marginBottom: "6px" }}>
        {pubmedUrl ? (
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a1a1a", textDecoration: "none" }}>
            {article.title}
          </a>
        ) : article.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: article.short_resume ? "10px" : 0 }}>
        {article.article_type && <ArticleBadge type={article.article_type} />}
        {meta && <span style={{ fontSize: "12px", color: "#888" }}>{meta}</span>}
      </div>
      {article.short_resume && (
        <div style={{ fontSize: "13px", color: "#555", lineHeight: 1.65 }}>
          {article.short_resume}
        </div>
      )}
      {pubmedUrl && (
        <div style={{ marginTop: "10px" }}>
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#E83B2A", fontWeight: 600, textDecoration: "none" }}>
            Read on PubMed →
          </a>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#E83B2A",
      borderBottom: "2px solid #E83B2A",
      paddingBottom: "8px",
      marginBottom: "14px",
    }}>
      {children}
    </div>
  );
}

type GlobalArticleRow = {
  sort_order: number;
  subspecialty: string | null;
  articles: {
    id: string;
    title: string;
    pubmed_id: string | null;
    pubmed_indexed_at: string | null;
    article_type: string | null;
    journal_abbr: string | null;
  } | null;
};

function TopArticlesWidget({ articles }: { articles: GlobalArticleRow[] }) {
  const sorted = [...articles]
    .filter(r => r.articles)
    .sort((a, b) => {
      const da = a.articles?.pubmed_indexed_at ?? "";
      const db = b.articles?.pubmed_indexed_at ?? "";
      return db.localeCompare(da);
    });

  if (sorted.length === 0) return null;

  return (
    <div style={{
      width: "50%",
      minWidth: "280px",
      background: "#fff",
      borderRadius: "12px",
      border: "1px solid #e5e9f0",
      padding: "20px",
      boxSizing: "border-box",
    }}>
      <div style={{
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#E83B2A",
        borderBottom: "2px solid #E83B2A",
        paddingBottom: "8px",
        marginBottom: "14px",
      }}>
        This month&apos;s highlights
      </div>
      <div style={{
        maxHeight: "420px",
        overflowY: "auto",
        paddingRight: "4px",
      }}>
        {sorted.map((row, i) => {
          const a = row.articles!;
          const url = a.pubmed_id ? `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/` : null;
          return (
            <div key={a.id} style={{
              paddingBottom: "12px",
              marginBottom: "12px",
              borderBottom: i < sorted.length - 1 ? "1px solid #f0f2f5" : "none",
            }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "5px" }}>
                {row.subspecialty && (
                  <span style={{
                    fontSize: "10px", fontWeight: 600, color: "#6b7280",
                    background: "#f3f4f6", borderRadius: "4px", padding: "2px 6px",
                  }}>
                    {row.subspecialty}
                  </span>
                )}
                {a.article_type && (
                  <span style={{
                    fontSize: "10px", fontWeight: 600, color: "#E83B2A",
                    background: "#fef2f2", borderRadius: "4px", padding: "2px 6px",
                  }}>
                    {a.article_type}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.45, marginBottom: "5px" }}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#1a1a1a", textDecoration: "none" }}>
                    {a.title}
                  </a>
                ) : a.title}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>
                {[a.journal_abbr, a.pubmed_indexed_at ? new Date(a.pubmed_indexed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function HomeV1() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const pfVersionCookie = cookieStore.get("pf-version")?.value;
  const isAdminUser = user.app_metadata?.role === "admin";
  const showPreviewBanner = isAdminUser && !!pfVersionCookie;
  const previewVersion = pfVersionCookie === "v2" ? "v2" : "v1";

  const previewBanner = showPreviewBanner ? (
    <div style={{
      background: previewVersion === "v2" ? "#fee2e2" : "#fef3c7",
      borderBottom: `1px solid ${previewVersion === "v2" ? "#f87171" : "#f59e0b"}`,
      padding: "6px 16px",
      fontSize: "12px",
      fontWeight: 600,
      color: previewVersion === "v2" ? "#991b1b" : "#92400e",
      textAlign: "center",
      letterSpacing: "0.03em",
    }}>
      DEV PREVIEW — {previewVersion.toUpperCase()}
    </div>
  ) : null;

  const [{ data: profile }, { data: editionRaw }, { data: subsRows }] = await Promise.all([
    supabase
      .from("users")
      .select("name, subspecialties")
      .eq("id", user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("newsletter_editions")
      .select("id, week_number, year, content")
      .eq("status", "approved")
      .order("year", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("subspecialties")
      .select("name, short_name")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("active", true),
  ]);
  const edition = editionRaw as { id: string; week_number: number; year: number; content: NewsletterContent } | null;

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties: string[] = Array.isArray(profile?.subspecialties)
    ? (profile.subspecialties as string[])
    : [];
  const shortNameMap: Record<string, string> = Object.fromEntries(
    ((subsRows ?? []) as { name: string; short_name: string | null }[])
      .map((r) => [r.name, r.short_name ?? r.name])
  );

  // Case A — no published edition yet
  if (!edition) {
    return (
      <>
        {previewBanner}
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 40px" }}>
          <div style={{ maxWidth: "620px", marginBottom: "24px" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>
              Welcome, {firstName}
            </div>
          </div>
          <KPIOverviewV1 userSubspecialties={userSubspecialties} shortNameMap={shortNameMap} />
        </div>
      </>
    );
  }

  // Fetch global articles for the current edition (sequential — needs edition.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: editionArticleRows } = await (supabase as any)
    .from("newsletter_edition_articles")
    .select("sort_order, subspecialty, article_id")
    .eq("edition_id", edition.id)
    .eq("is_global", true);

  let globalArticles: GlobalArticleRow[] = [];
  if (editionArticleRows && editionArticleRows.length > 0) {
    const articleIds = editionArticleRows.map((r: { article_id: string }) => r.article_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articleRows } = await (supabase as any)
      .from("articles")
      .select("id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr")
      .in("id", articleIds);

    if (articleRows) {
      const articleMap = Object.fromEntries(
        (articleRows as GlobalArticleRow["articles"][]).map((a) => [a!.id, a])
      );
      globalArticles = (editionArticleRows as { sort_order: number; subspecialty: string | null; article_id: string }[])
        .map((r) => ({
          sort_order: r.sort_order,
          subspecialty: r.subspecialty,
          articles: articleMap[r.article_id] ?? null,
        }))
        .filter((r) => r.articles !== null)
        .sort((a, b) => {
          const da = a.articles?.pubmed_indexed_at ?? "";
          const db = b.articles?.pubmed_indexed_at ?? "";
          return db.localeCompare(da);
        });
    }
  }

  // Case B — edition exists
  const content = edition.content as NewsletterContent;

  // Filter subspecialty sections to only those the user has selected
  const visibleSubspecialties = userSubspecialties.length > 0
    ? (content.subspecialties ?? []).filter((s) =>
        userSubspecialties.some((u) => u.toLowerCase() === s.name.toLowerCase())
      )
    : (content.subspecialties ?? []);

  const hasContent =
    (content.general?.length ?? 0) > 0 ||
    visibleSubspecialties.some((s) => s.articles.length > 0);

  return (
    <>
      {previewBanner}

      {/* Header + KPI widget — wider container */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 0" }}>
        <div style={{ maxWidth: "620px", marginBottom: "24px" }}>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>
            Welcome back, {firstName}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
            Week {edition.week_number}, {edition.year}
          </div>
        </div>

        <KPIOverviewV1 userSubspecialties={userSubspecialties} shortNameMap={shortNameMap} />

        <div style={{ marginTop: "24px" }}>
          <TopArticlesWidget articles={globalArticles} />
        </div>
      </div>

      {/* Newsletter content — narrow reading width */}
      <div style={{ maxWidth: "620px", margin: "0 auto", padding: "0 24px 80px" }}>

        {!hasContent && (
          <div style={{ fontSize: "14px", color: "#888", marginTop: "28px" }}>No articles in this edition.</div>
        )}

        {/* General section first */}
        {(content.general?.length ?? 0) > 0 && (
          <div style={{ marginBottom: "32px", marginTop: "28px" }}>
            <SectionHeading>General</SectionHeading>
            {content.general.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}

        {/* Subspecialty sections matching user's selection */}
        {visibleSubspecialties
          .filter((s) => s.articles.length > 0)
          .map((s, i) => (
            <div key={s.name} style={{ marginBottom: "32px", marginTop: i === 0 && (content.general?.length ?? 0) === 0 ? "28px" : 0 }}>
              <SectionHeading>{s.name}</SectionHeading>
              {s.articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ))}

      </div>
    </>
  );
}
