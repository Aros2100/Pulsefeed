import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendNewsletter } from "@/lib/newsletter/send";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { editionId: string; userId: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { editionId, userId } = body;
  if (!editionId || !userId) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const result = await sendNewsletter(editionId, userId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sendId: result.sendId });
}
