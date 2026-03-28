import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { resolveCityAlias } from "@/lib/geo/city-aliases";

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const admin = createAdminClient();

  const { data: authors, error, count } = await admin
    .from("authors")
    .select("id, affiliations", { count: "exact" })
    .not("affiliations", "eq", "{}")
    .eq("geo_source", "parser")
    .is("country", null)
    .range(offset, offset + BATCH_SIZE - 1)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const batch = authors ?? [];
  let updated = 0;
  let skipped = 0;

  for (const author of batch) {
    const affiliations = author.affiliations as string[] | null;
    if (!affiliations?.length) {
      skipped++;
      continue;
    }

    try {
      const parsed = await parseAffiliation(affiliations[0]);

      await admin
        .from("authors")
        .update({
          department: parsed?.department ?? null,
          hospital: parsed?.institution ?? null,
          city: parsed?.city ? await resolveCityAlias(parsed.city, parsed?.country ?? "") : null,
          country: parsed?.country ?? null,
          geo_source: "parser",
        })
        .eq("id", author.id);

      updated++;
    } catch {
      skipped++;
    }
  }

  const nextOffset = offset + batch.length;
  const done = batch.length < BATCH_SIZE;

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    done,
    nextOffset: done ? null : nextOffset,
    totalRemaining: count ?? null,
  });
}
