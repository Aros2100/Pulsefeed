import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const circle = parseInt(searchParams.get("circle") ?? "0");
  if (![1, 2, 3].includes(circle)) {
    return NextResponse.json({ ok: false, error: "Invalid circle (1-3)" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const countQ = (status: string) =>
    admin.from("articles").select("id", { count: "exact", head: true })
      .eq("circle", circle).eq("status", status) as Promise<{ count: number | null }>;

  const [approvedRes, pendingRes, rejectedRes] = await Promise.all([
    countQ("approved"),
    countQ("pending"),
    countQ("rejected"),
  ]);

  const approved = (approvedRes as { count: number | null }).count ?? 0;
  const pending = (pendingRes as { count: number | null }).count ?? 0;
  const rejected = (rejectedRes as { count: number | null }).count ?? 0;
  const total = approved + pending + rejected;

  return NextResponse.json({ ok: true, total, pending, approved });
}
