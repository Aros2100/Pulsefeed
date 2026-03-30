import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { type Author } from "@/lib/artikel-import/fetcher";
import { linkAuthorsToArticle } from "@/lib/forfatter-import/find-or-create";
import { logArticleEvent } from "@/lib/article-events";

const TAG_REMAP: Record<string, string> = {
  "Neuroscience":        "neuroscience",
  "Basic neuro research": "basic_neuro_research",
  "Neurology":           "neurology",
  "Oncology":            "oncology",
  "Anesthesiology":      "anesthesiology",
  "ENT":                 "ent",
  "Radiology":           "radiology",
  "Ophthalmology":       "ophthalmology",
  "Psychiatry":          "psychiatry",
  "Nuclear Medicine":    "nuclear_medicine",
  "Health Care Management": "health_care_management",
};

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

  // Re-fetch ai_decision from DB — never trust client-sent values
  const articleIds = verdicts.map((v) => v.article_id);
  const { data: freshArticles } = await admin
    .from("articles")
    .select("id, ai_decision, specialty_confidence, specialty_reasoning")
    .in("id", articleIds);

  const freshMap = new Map(
    (freshArticles ?? []).map((a) => [a.id as string, a as { id: string; ai_decision: string | null; specialty_confidence: number | null; specialty_reasoning: string | null }])
  );

  // Auth is enforced above via requireAdmin.
  const editorId: string | null = auth.userId ?? null;

  // Hent aktiv model-version til at tagge lab_decisions med
  const { data: activeVersion } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", module)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const modelVersion = (activeVersion?.version as string | null) ?? null;

  const approvedIds = verdicts.filter((v) => v.verdict === "approved").map((v) => v.article_id);
  const rejectedIds = verdicts.filter((v) => v.verdict === "rejected").map((v) => v.article_id);

  // Split rejected into those needing specialty_tags remap and regular rejections
  const rejectedRemapVerdicts = verdicts.filter(
    (v) => v.verdict === "rejected" && v.disagreement_reason != null && TAG_REMAP[v.disagreement_reason] != null
  );
  const rejectedRegularIds = verdicts
    .filter((v) => v.verdict === "rejected" && (v.disagreement_reason == null || TAG_REMAP[v.disagreement_reason] == null))
    .map((v) => v.article_id);

  // 1. Create lab_session row
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

  // 2. Insert lab_decisions (one per verdict)
  const decisionRows = verdicts.map((v) => ({
    session_id: sessionId,
    article_id: v.article_id,
    specialty,
    module,
    decision: v.verdict,
    ai_decision: (freshMap.get(v.article_id)?.ai_decision ?? null) as "approved" | "rejected" | null,
    ai_confidence: freshMap.get(v.article_id)?.specialty_confidence ?? null,
    ai_reasoning: freshMap.get(v.article_id)?.specialty_reasoning ?? null,
    disagreement_reason: v.disagreement_reason ?? null,
    model_version: modelVersion,
  }));

  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[lab/sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  void Promise.all(
    verdicts.map((v) =>
      logArticleEvent(v.article_id, "lab_decision", {
        module,
        editor_verdict:      v.verdict,
        ai_verdict:          v.ai_decision ?? null,
        confidence:          v.ai_confidence ?? null,
        disagreement_reason: v.disagreement_reason ?? null,
      })
    )
  );

  // 3. Apply article updates in parallel

  // Fetch old status before updating so we can record the transition
  const allChangedIds = [...approvedIds, ...rejectedIds];
  const { data: oldArticles } = allChangedIds.length > 0
    ? await admin.from("articles").select("id, status, specialty_tags").in("id", allChangedIds)
    : { data: [] };
  const oldMap = new Map((oldArticles ?? []).map((a) => [a.id as string, a as { id: string; status: string | null; specialty_tags: string[] | null }]));

  const [approvedResult, rejectedResult, ...remapResults] = await Promise.all([
    approvedIds.length > 0
      ? Promise.all(approvedIds.map((id) => {
          const oldTags = (oldMap.get(id)?.specialty_tags ?? []) as string[];
          const newTags = [...new Set([...oldTags, specialty])];
          return admin.from("articles")
            .update({ approval_method: "human", status: "approved", specialty_tags: newTags })
            .eq("id", id);
        }))
      : Promise.resolve([]),
    rejectedRegularIds.length > 0
      ? Promise.all(rejectedRegularIds.map((id) => {
          const oldTags = (oldMap.get(id)?.specialty_tags ?? []) as string[];
          const newTags = oldTags.filter((t) => t !== specialty);
          return admin.rpc("replace_article_specialty_tags", {
            p_article_id: id,
            p_tags:       newTags,
            p_status:     "rejected",
          });
        }))
      : Promise.resolve([]),
    // Per-article updates for remap rejections — bruger RPC der bypasser
    // merge_article_specialty_tags-triggeren, så specialty fjernes rent.
    ...rejectedRemapVerdicts.map((v) => {
      const remapTag = TAG_REMAP[v.disagreement_reason!]!;
      const oldTags  = (oldMap.get(v.article_id)?.specialty_tags ?? []) as string[];
      const newTags  = [...new Set(oldTags.filter((t) => t !== specialty).concat(remapTag))];
      return admin.rpc("replace_article_specialty_tags", {
        p_article_id: v.article_id,
        p_tags:       newTags,
        p_status:     "rejected",
      });
    }),
  ]);

  const approvedErrors = (approvedResult as { error: unknown }[]).filter((r) => r.error);
  if (approvedErrors.length > 0) {
    console.error("[lab/sessions] articles approved update error:", approvedErrors[0].error);
    return NextResponse.json({ ok: false, error: "Failed to update approved articles" }, { status: 500 });
  }
  const rejectedErrors = (rejectedResult as { error: unknown }[]).filter((r) => r.error);
  if (rejectedErrors.length > 0) {
    console.error("[lab/sessions] articles rejected update error:", rejectedErrors[0].error);
    return NextResponse.json({ ok: false, error: "Failed to update rejected articles" }, { status: 500 });
  }
  for (const r of remapResults) {
    if (r.error) {
      console.error("[lab/sessions] articles remap update error:", r.error);
      return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    }
  }

  void Promise.all([
    ...approvedIds.map((id) => {
      const old = oldMap.get(id);
      return logArticleEvent(id, "status_changed", { from: old?.status ?? null, to: "approved", changed_by: auth.userId });
    }),
    ...rejectedIds.map((id) => {
      const old = oldMap.get(id);
      return logArticleEvent(id, "status_changed", { from: old?.status ?? null, to: "rejected", changed_by: auth.userId });
    }),
  ]);

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
            affiliations: Array.isArray(a.affiliations)
              ? (a.affiliations as string[])
              : a.affiliation != null ? [String(a.affiliation)] : [],
            orcid:       a.orcid != null ? String(a.orcid) : null,
          }));

          if (authors.length === 0) continue;

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
