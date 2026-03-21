import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

async function runComputeAuthorScores() {
  const admin = createAdminClient();
  const { error } = await admin.rpc("compute_author_scores");
  if (error) {
    console.error("[author-score] Failed:", error.message);
  } else {
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(() => runComputeAuthorScores());

  return NextResponse.json({ ok: true });
}
