import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAffiliationWithTrace } from "@/lib/geo/affiliation-parser";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const input_string = body.input_string;

  if (typeof input_string !== "string" || !input_string.trim()) {
    return NextResponse.json({ error: "input_string must be a non-empty string" }, { status: 400 });
  }
  if (input_string.length > 2000) {
    return NextResponse.json({ error: "input_string exceeds 2000 character limit" }, { status: 400 });
  }

  const start = Date.now();
  try {
    const { input, result, trace } = await parseAffiliationWithTrace(input_string);
    const duration_ms = Math.round((Date.now() - start) * 10) / 10;
    return NextResponse.json({ input, result, trace, duration_ms });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
