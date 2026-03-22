import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const schema = z.object({
  decision_id:  z.string().uuid(),
  article_id:   z.string().uuid(),
  new_verdict:  z.enum(["approved", "rejected"]),
  specialty:    z.string(),
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

  const { decision_id, article_id, new_verdict, specialty } = result.data;
  const admin = createAdminClient();

  const [{ error: decisionError }, { error: articleError }] = await Promise.all([
    admin
      .from("lab_decisions")
      .update({ decision: new_verdict })
      .eq("id", decision_id),
    new_verdict === "approved"
      ? admin.from("articles").update({
          status: "approved",
          approval_method: "human",
          specialty_tags: [specialty],
        }).eq("id", article_id)
      : admin.from("articles").update({ status: "rejected" }).eq("id", article_id),
  ]);

  if (decisionError) return NextResponse.json({ ok: false, error: decisionError.message }, { status: 500 });
  if (articleError)  return NextResponse.json({ ok: false, error: articleError.message },  { status: 500 });

  return NextResponse.json({ ok: true });
}
