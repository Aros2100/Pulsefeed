import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendNewsletter, type NewsletterContent } from "@/lib/newsletter/send";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { userId: string; weekNumber: number; year: number; content: NewsletterContent };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, weekNumber, year, content } = body;

  if (!userId || !weekNumber || !year || !content) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const result = await sendNewsletter(userId, weekNumber, year, content);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sendId: result.sendId });
}
