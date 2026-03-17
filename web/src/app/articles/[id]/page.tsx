import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import ArticleStamkort, { type ArticleData } from "@/components/articles/ArticleStamkort";
import SidebarNav from "./SidebarNav";
import SaveButton from "@/components/SaveButton";
import ArticleViewTracker from "./ArticleViewTracker";
import ShareButton from "./ShareButton";
import BackButton from "./BackButton";

interface PicoData { population?: string; intervention?: string; comparison?: string; outcome?: string }

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: article }, { data: savedRow }, { data: projectRows }] = await Promise.all([
    supabase.from("articles").select("*").eq("id", id).eq("status", "approved").single(),
    supabase.from("saved_articles").select("project_id").eq("user_id", user.id).eq("article_id", id).maybeSingle(),
    supabase.from("projects").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (!article) notFound();

  const authorCount  = Array.isArray(article.authors)    ? article.authors.length    : 0;
  const meshCount    = Array.isArray(article.mesh_terms)  ? article.mesh_terms.length  : 0;
  const grantCount   = Array.isArray(article.grants)      ? article.grants.length      : 0;
  const isEnriched   = !!article.enriched_at;
  const pico         = article.pico as PicoData | null;
  const hasPico      = !!(pico?.population || pico?.intervention || pico?.comparison || pico?.outcome);

  const navItems = [
    { id: "facts",      label: "Facts" },
    article.keywords?.length ? { id: "keywords",   label: "Keywords",   badge: article.keywords.length } : null,
    meshCount             ? { id: "mesh",        label: "MeSH Terms", badge: meshCount }           : null,
    isEnriched            ? { id: "ai-summary",  label: "AI Summary", ai: true }                  : null,
    isEnriched && hasPico ? { id: "pico",        label: "PICO",       ai: true }                  : null,
    authorCount           ? { id: "authors",     label: "Authors",    badge: authorCount }          : null,
    article.abstract      ? { id: "abstract",    label: "Abstract" }                               : null,
    grantCount            ? { id: "funding",     label: "Funding",    badge: grantCount }           : null,
    { id: "citation", label: "Cite" },
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const projects  = (projectRows ?? []) as { id: string; name: string }[];
  const isSaved   = !!savedRow;
  const projectId = savedRow?.project_id ?? null;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />
      <ArticleViewTracker articleId={id} />

      <div style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        maxWidth: "860px",
        margin: "0 auto",
        padding: "0 24px",
        gap: "32px",
      }}>
        <SidebarNav items={navItems} />

        <main style={{ padding: "32px 0 80px" }}>
          {/* Action bar */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", marginBottom: "16px" }}>
            <BackButton />
            <ShareButton />
            <SaveButton
              articleId={id}
              initialSaved={isSaved}
              initialProjectId={projectId}
              projects={projects}
            />
          </div>

          <ArticleStamkort article={article as unknown as ArticleData} />
        </main>
      </div>
    </div>
  );
}
