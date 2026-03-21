import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SavedPageClient from "./SavedPageClient";

interface SavedArticle {
  id:           string;
  project_id:   string | null;
  article_id:   string | null;
  saved_at:     string | null;
  articles: {
    id:             string;
    title:          string;
    journal_abbr:   string | null;
    published_date: string | null;
  } | null;
}

interface Project {
  id:         string;
  name:       string;
  created_at: string | null; // nullable per DB schema
}

export default async function SavedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projectRows }, { data: savedRows }] = await Promise.all([
    supabase.from("projects").select("id, name, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("saved_articles")
      .select("id, project_id, article_id, saved_at, articles(id, title, journal_abbr, published_date)")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false }),
  ]);

  const projects = (projectRows ?? []) as Project[];
  const allSaved = (savedRows   ?? []) as SavedArticle[];
  const unsorted = allSaved.filter((s) => s.project_id === null);

  type ArticleItem = { id: string; title: string; journal_abbr: string | null; published_date: string | null; saved_id: string };

  function toItem(s: SavedArticle): ArticleItem {
    return {
      id:             s.article_id ?? "",
      title:          s.articles?.title ?? "",
      journal_abbr:   s.articles?.journal_abbr ?? null,
      published_date: s.articles?.published_date ?? null,
      saved_id:       s.id,
    };
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Saved Articles</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>{allSaved.length} article{allSaved.length !== 1 ? "s" : ""} saved</div>
        </div>

        <SavedPageClient
          projects={projects}
          unsorted={unsorted.map(toItem)}
          projectArticles={projects.map((p) => ({
            project: p,
            articles: allSaved.filter((s) => s.project_id === p.id).map(toItem),
          }))}
        />
      </div>
    </div>
  );
}
