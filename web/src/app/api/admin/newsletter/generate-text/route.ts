import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { trackedCall } from "@/lib/ai/tracked-client";

const schema = z.object({
  type:         z.enum(["global", "subspecialty"]),
  subspecialty: z.string().optional(),
  articles:     z.array(z.object({
    title:        z.string(),
    article_type: z.string().nullable(),
  })).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { type, subspecialty, articles } = parsed.data;

  const articleList = articles
    .map((a) => `- ${a.title}${a.article_type ? ` · ${a.article_type}` : ""}`)
    .join("\n");

  const tone = "Write in a confident, collegial tone — as one neurosurgeon briefing another. Avoid listing facts mechanically. Maximum 2 sentences. No more. Return only the text, nothing else.";

  const prompt = type === "global"
    ? `You are the editor of PulseFeed — a weekly medical newsletter for neurosurgeons. Write a short 2-sentence intro in English that highlights what makes these three articles worth reading this week. The articles will appear at the bottom of the newsletter — write the intro so it creates anticipation for them. Write in a confident, collegial tone — as one neurosurgeon briefing another. One or two sentences maximum. If you write more than two sentences, you have failed. Return only the text, nothing else.\n\nArticles:\n${articleList}`
    : `You are the editor of PulseFeed — a weekly medical newsletter for neurosurgeons. Write a short comment in English about this week's articles within ${subspecialty ?? "this subspecialty"}. Highlight what is noteworthy. Be direct and precise — no filler phrases. One or two sentences maximum. If you write more than two sentences, you have failed. Return only the text, nothing else.\n\nArticles:\n${articleList}`;

  try {
    const message = await trackedCall("newsletter_generate_text", {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    console.error("[generate-text] error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
