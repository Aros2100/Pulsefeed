import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runPublicationTypeMapping } from "@/lib/tagging/publication-type-mapper";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(() => {
    runPublicationTypeMapping()
      .catch((e) => console.error("[pubtype-map] error:", e));
  });

  return NextResponse.json({ ok: true });
}
