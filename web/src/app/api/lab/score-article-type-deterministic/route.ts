import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type Rule = {
  publication_type: string;
  article_type: string;
  priority: number;
};

type Article = {
  id: string;
  publication_types: unknown;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/,/g, "").trim();
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Fetch active rules
        const { data: rulesData, error: rulesError } = await admin
          .from("article_type_rules")
          .select("publication_type, article_type, priority")
          .eq("is_active", true);

        if (rulesError) {
          send({ done: true, error: (rulesError as { message: string }).message, scored: 0, skipped: 0 });
          controller.close();
          return;
        }

        const rules = (rulesData ?? []) as unknown as Rule[];
        const priorityMap = new Map<string, { article_type: string; priority: number }>();
        for (const rule of rules) {
          priorityMap.set(normalize(rule.publication_type), {
            article_type: rule.article_type,
            priority:     rule.priority,
          });
        }

        if (priorityMap.size === 0) {
          send({ done: true, scored: 0, skipped: 0 });
          controller.close();
          return;
        }

        // Collect all candidate articles via RPC (specialty_match = true, article_type_ai IS NULL)
        const allArticles: Article[] = [];
        const PAGE = 1000;
        for (let offset = 0; ; offset += PAGE) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (admin as any).rpc("get_article_type_candidates", {
            p_offset: offset,
            p_limit: PAGE,
          });

          if (!data || data.length === 0) break;
          allArticles.push(...(data as Article[]));
          if (data.length < PAGE) break;
        }

        const total = allArticles.length;
        let scored = 0;
        let skipped = 0;

        for (const article of allArticles) {
          const pubTypes = Array.isArray(article.publication_types)
            ? (article.publication_types as string[])
            : [];

          let matched: string | null = null;
          let matchedRaw: string | null = null;
          let matchedPriority = Infinity;

          for (const pt of pubTypes) {
            const key = normalize(pt);
            const rule = priorityMap.get(key);
            if (rule && rule.priority < matchedPriority) {
              matched = rule.article_type;
              matchedRaw = pt;
              matchedPriority = rule.priority;
            }
          }

          if (!matched || !matchedRaw) {
            skipped++;
          } else {
            await admin
              .from("articles")
              .update({
                article_type_ai:            matched,
                article_type_confidence:    95,
                article_type_rationale:     `Classified by publication type: ${matchedRaw}`,
                article_type_method:        "deterministic",
                article_type_validated:     false,
                article_type_scored_at:     new Date().toISOString(),
                article_type_model_version: "deterministic-v2",
              })
              .eq("id", article.id);
            scored++;
          }

          send({ scored, total });
        }

        send({ done: true, scored, skipped });
      } catch (e) {
        send({ done: true, error: String(e), scored: 0, skipped: 0 });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "Content-Encoding":  "none",
      "X-Accel-Buffering": "no",
    },
  });
}
