import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAffiliationWithTrace } from "@/lib/geo/affiliation-parser";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const strings: string[] = Array.isArray(body.strings) ? body.strings : [];

  if (strings.length === 0) {
    return NextResponse.json({ error: "strings array is required" }, { status: 400 });
  }

  const results = await Promise.all(strings.map(parseAffiliationWithTrace));
  return NextResponse.json({ results });
}
