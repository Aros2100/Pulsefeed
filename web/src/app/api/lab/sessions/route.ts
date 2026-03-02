import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { linkAuthorsToArticle, type Author } from "@/lib/pubmed/importer";

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  module: z.string().default("specialty_tag"),
  verdicts: z.array(z.object({
    article_id: z.string().uuid(),
    verdict: z.enum(["approved", "rejected"]),
    ai_decision: z.enum(["approved", "rejected"]).nullable().optional(),
    ai_confidence: z.number().int().min(0).max(100).nullable().optional(),
    disagreement_reason: z.string().nullable().optional(),
  })).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, module, verdicts } = result.data;
  const admin = createAdminClient();

  // user_id FK currently references public.users — pass null to avoid constraint
  // violations until the FK target is confirmed. Auth is already enforced above.
  const editorId: string | null = null;

  const approvedIds = verdicts.filter((v) => v.verdict === "approved").map((v) => v.article_id);
  const rejectedIds = verdicts.filter((v) => v.verdict === "rejected").map((v) => v.article_id);

  // 1. Create lab_session row
  console.log("[lab/sessions] inserting lab_session", { specialty, module, verdicts: verdicts.length });
  const { data: session, error: sessionError } = await admin
    .from("lab_sessions")
    .insert({
      specialty,
      module,
      user_id: editorId,
      completed_at: new Date().toISOString(),
      articles_reviewed: verdicts.length,
      articles_approved: approvedIds.length,
      articles_rejected: rejectedIds.length,
    })
    .select("id")
    .single();

  if (sessionError) {
    console.error("[lab/sessions] lab_sessions insert error:", sessionError);
    return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  }

  const sessionId = session.id as string;
  console.log("[lab/sessions] session created", sessionId);

  // 2. Insert lab_decisions (one per verdict)
  const decisionRows = verdicts.map((v) => ({
    session_id: sessionId,
    article_id: v.article_id,
    specialty,
    module,
    decision: v.verdict,
    ai_decision: v.ai_decision ?? null,
    ai_confidence: v.ai_confidence ?? null,
    disagreement_reason: v.disagreement_reason ?? null,
  }));

  console.log("[lab/sessions] inserting lab_decisions", decisionRows.length);
  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[lab/sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  // 3. Apply article updates in parallel
  console.log("[lab/sessions] updating articles — approved:", approvedIds.length, "rejected:", rejectedIds.length);
  const [approvedResult, rejectedResult] = await Promise.all([
    approvedIds.length > 0
      ? admin.from("articles")
          .update({ verified: true, circle: 1, status: "approved", specialty_tags: [specialty] })
          .in("id", approvedIds)
      : Promise.resolve({ error: null }),
    rejectedIds.length > 0
      ? admin.from("articles")
          .update({ verified: false, circle: 3, status: "rejected", specialty_tags: [] })
          .in("id", rejectedIds)
      : Promise.resolve({ error: null }),
  ]);

  if (approvedResult.error) {
    console.error("[lab/sessions] articles approved update error:", approvedResult.error);
    return NextResponse.json({ ok: false, error: approvedResult.error.message }, { status: 500 });
  }
  if (rejectedResult.error) {
    console.error("[lab/sessions] articles rejected update error:", rejectedResult.error);
    return NextResponse.json({ ok: false, error: rejectedResult.error.message }, { status: 500 });
  }
  console.log("[lab/sessions] all done");

  // Background: link authors for approved articles (fire-and-forget)
  if (approvedIds.length > 0) {
    void (async () => {
      try {
        const { data: approvedArticles } = await admin
          .from("articles")
          .select("id, pubmed_id, authors")
          .in("id", approvedIds);

        for (const article of approvedArticles ?? []) {
          const rawAuthors = (article.authors ?? []) as Record<string, unknown>[];
          const authors: Author[] = rawAuthors.map((a) => ({
            lastName:    String(a.lastName ?? ""),
            foreName:    String(a.foreName ?? ""),
            affiliation: a.affiliation != null ? String(a.affiliation) : null,
            orcid:       a.orcid != null ? String(a.orcid) : null,
          }));

          if (authors.length === 0) continue;

          console.log(`[lab] linking authors for approved article PMID ${article.pubmed_id}`);
          await linkAuthorsToArticle(admin, article.id, authors).catch((e) => {
            console.error(`[lab] author linking failed for PMID ${article.pubmed_id}:`, e);
          });
        }
      } catch (e) {
        console.error("[lab] background author linking error:", e);
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    approved: approvedIds.length,
    rejected: rejectedIds.length,
  });
}
