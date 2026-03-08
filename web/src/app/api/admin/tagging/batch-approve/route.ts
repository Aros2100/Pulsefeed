import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";
import { z } from "zod";

const schema = z.object({
  articleIds: z.array(z.string().uuid()).min(1).max(500),
  specialty: z.string(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  let approved = 0;

  // Batch update in chunks of 50
  const { articleIds, specialty } = parsed.data;
  for (let i = 0; i < articleIds.length; i += 50) {
    const chunk = articleIds.slice(i, i + 50);
    const { error } = await admin
      .from("articles")
      .update({
        status: "approved",
        auto_tagged_at: now,
      } as never)
      .in("id", chunk)
      .eq("status", "pending");

    if (!error) {
      for (const id of chunk) {
        await logArticleEvent(id, "auto_tagged", {
          specialty,
          batch_approved: true,
          approved_by: auth.userId,
        });
      }
      approved += chunk.length;
    }
  }

  return NextResponse.json({ ok: true, approved });
}
