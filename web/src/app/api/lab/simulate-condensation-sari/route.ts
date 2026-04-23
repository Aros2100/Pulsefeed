import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { scoreSari } from "@/lib/lab/scorer";

const schema = z.object({
  article_id: z.string().uuid(),
  title:      z.string(),
  abstract:   z.string().nullable(),
  prompt:     z.string(),
  specialty:  z.string(),
});

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

  const { article_id, title, abstract, prompt } = parsed.data;
  const activePrompt = { prompt, version: "sim" };

  try {
    const result = await scoreSari(
      { id: article_id, title, abstract },
      activePrompt
    );

    const hasContent = !!(result.sari_subject && result.sari_action && result.sari_result && result.sari_implication);
    return NextResponse.json({
      ok:         true,
      decision:   hasContent ? "approved" : "rejected",
      confidence: null,
      reason:     hasContent
        ? `${result.sari_subject}`
        : "Missing SARI fields",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
