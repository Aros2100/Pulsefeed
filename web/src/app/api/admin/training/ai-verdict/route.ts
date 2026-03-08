import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackedCall } from "@/lib/ai/tracked-client";

type AIVerdict = "relevant" | "not_relevant" | "unsure";

function scoreToVerdict(score: number): AIVerdict {
  if (score >= 70) return "relevant";
  if (score < 40) return "not_relevant";
  return "unsure";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const articleId = request.nextUrl.searchParams.get("articleId");
  const specialty = request.nextUrl.searchParams.get("specialty");
  if (!articleId || !specialty) {
    return NextResponse.json({ ok: false, error: "Missing articleId or specialty" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: article } = await admin
    .from("articles")
    .select("title, abstract, specialty_confidence, ai_decision, specialty_scored_at")
    .eq("id", articleId)
    .single();

  if (!article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  // Return stored score if article has already been scored — no new AI call
  if (article.specialty_scored_at != null || article.specialty_confidence != null) {
    const score = article.specialty_confidence as number | null;
    const storedDecision = article.ai_decision as string | null;
    const verdict: AIVerdict =
      storedDecision === "approved" ? "relevant" :
      storedDecision === "rejected" ? "not_relevant" :
      score != null ? scoreToVerdict(score) : "unsure";
    return NextResponse.json({ ok: true, verdict, confidence: score, ai_decision: storedDecision });
  }

  const content = [
    `Title: ${article.title}`,
    article.abstract ? `\nAbstract:\n${article.abstract}` : "",
  ].join("");

  const message = await trackedCall("specialty_tag_v1", {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    messages: [{
      role: "user",
      content: `How confident are you that this medical article is relevant to ${specialty}? Reply with ONLY an integer from 0 to 100, where 100 = definitely relevant, 0 = definitely not relevant.\n\n${content}`,
    }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const score = Math.min(100, Math.max(0, parseInt(raw.replace(/\D/g, ""), 10) || 50));

  await admin.from("articles").update({ specialty_confidence: score }).eq("id", articleId);

  return NextResponse.json({ ok: true, verdict: scoreToVerdict(score), confidence: score });
}
