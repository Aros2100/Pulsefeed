import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { trackedCall } from "@/lib/ai/tracked-client";

const DELAY_MS = 1300; // stay safely under 50 req/min

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  prompt: z.string().min(10),
  article_ids: z.array(z.string().uuid()).min(1).max(50),
});

type Article = { id: string; title: string; abstract: string | null };

async function scoreWithPrompt(
  article: Article,
  specialty: string,
  promptTemplate: string
): Promise<{ ai_decision: "approved" | "rejected"; confidence: number }> {
  const content = promptTemplate
    .replace(/\{\{specialty\}\}|\{specialty\}/g, specialty)
    .replace(/\{\{title\}\}|\{title\}/g, article.title)
    .replace(/\{\{abstract\}\}|\{abstract\}/g, article.abstract ?? "No abstract available");

  const message = await trackedCall("simulate_prompt", {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as { decision?: string; confidence?: number };
    const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 50))));
    const ai_decision: "approved" | "rejected" = parsed.decision === "approved" ? "approved" : "rejected";
    return { ai_decision, confidence };
  } catch {
    const match = raw.match(/\d+/);
    const confidence = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 50;
    return { ai_decision: confidence >= 50 ? "approved" : "rejected", confidence };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { specialty, prompt, article_ids } = parsed.data;
  const admin = createAdminClient();

  const { data: articles, error: fetchError } = await admin
    .from("articles")
    .select("id, title, abstract")
    .in("id", article_ids);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = (articles ?? []) as Article[];
  const total = toScore.length;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let scored = 0;

      try {
        for (const article of toScore) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
          try {
            const result = await scoreWithPrompt(article, specialty, prompt);
            scored++;
            send({
              scored,
              total,
              article_id:  article.id,
              decision:    result.ai_decision,
              confidence:  result.confidence,
            });
          } catch (e) {
            scored++;
            console.error(`[simulate-prompt] failed article ${article.id}:`, e);
            send({ scored, total, article_id: article.id, error: true });
          }
        }
        send({ done: true, scored, total });
      } catch (e) {
        send({ done: true, error: String(e), scored, total });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
