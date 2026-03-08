import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

type StatRow = { circle: number | null; status: string | null; antal: number };

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const circle = parseInt(searchParams.get("circle") ?? "0");
  if (![1, 2, 3].includes(circle)) {
    return NextResponse.json({ ok: false, error: "Invalid circle (1-3)" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data } = await admin.rpc(
    "get_specialty_article_stats" as never,
    { specialty_slug: "neurosurgery" } as never,
  );
  const rows = ((data as unknown as StatRow[]) ?? []).filter((r) => r.circle === circle);

  const total = rows.reduce((sum, r) => sum + Number(r.antal), 0);
  const pending = Number(rows.find((r) => r.status === "pending")?.antal ?? 0);
  const approved = Number(rows.find((r) => r.status === "approved")?.antal ?? 0);

  return NextResponse.json({ ok: true, total, pending, approved });
}
