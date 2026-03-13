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

type ScoreResult = {
  ai_decision: string;
  confidence: number;
  reason: string | null;
};

async function scoreWithPrompt(
  article: Article,
  specialty: string,
  promptTemplate: string
): Promise<ScoreResult> {
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
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      decision?: unknown;
      subspecialty?: unknown;
      confidence?: number;
      reason?: string;
    };
    const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 80))));

    let ai_decision: string;
    if (parsed.decision !== undefined) {
      // Specialty-tag format: { decision: "approved"/"rejected", confidence, reason }
      ai_decision = Array.isArray(parsed.decision)
        ? JSON.stringify(parsed.decision)
        : String(parsed.decision);
    } else if (parsed.subspecialty !== undefined) {
      // Classification format: { subspecialty: ["..."], reason: "..." }
      ai_decision = Array.isArray(parsed.subspecialty)
        ? JSON.stringify(parsed.subspecialty)
        : JSON.stringify([String(parsed.subspecialty)]);
    } else {
      ai_decision = "rejected";
    }

    return { ai_decision, confidence, reason: parsed.reason ?? null };
  } catch {
    // Fallback: return raw text
    return { ai_decision: raw, confidence: 50, reason: null };
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
              article_id: article.id,
              decision:   result.ai_decision,
              confidence: result.confidence,
              reason:     result.reason,
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
