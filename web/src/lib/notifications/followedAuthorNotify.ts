import { sendNotification } from "./send";
import { createAdminClient } from "@/lib/supabase/admin";

type MatchRow = {
  article_id: string | null;
  author_id:  string | null;
  authors:    { display_name: string } | null;
  articles:   { title: string } | null;
};

export async function notifyFollowedAuthorPublications(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;

  const supabase = createAdminClient();

  // Find article_authors rows for the newly linked articles
  const { data: rawMatches } = await supabase
    .from("article_authors")
    .select("article_id, author_id, authors(display_name), articles(title)")
    .in("article_id", articleIds);

  const matches = (rawMatches ?? []) as unknown as MatchRow[];
  if (matches.length === 0) return;

  const authorIds = [...new Set(matches.map((m) => m.author_id).filter((id): id is string => id !== null))];

  // Find users who follow any of these authors
  const { data: follows } = await supabase
    .from("author_follows")
    .select("user_id, author_id")
    .in("author_id", authorIds);

  if (!follows || follows.length === 0) return;

  // One notification per user per author (not per article)
  const seen = new Set<string>();

  for (const follow of follows) {
    if (!follow.user_id || !follow.author_id) continue;

    const authorArticles = matches.filter((m) => m.author_id === follow.author_id);
    if (authorArticles.length === 0) continue;

    const key = `${follow.user_id}:${follow.author_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const author = authorArticles[0].authors;
    const firstArticle = authorArticles[0].articles;
    const count = authorArticles.length;

    await sendNotification({
      userId: follow.user_id,
      type:   "author_publication",
      title:  `New publication from ${author?.display_name ?? "followed author"}`,
      message: count === 1
        ? (firstArticle?.title ?? "A new article has been indexed")
        : `${count} new articles have been indexed`,
      link: `/authors/${follow.author_id}`,
    });
  }
}
