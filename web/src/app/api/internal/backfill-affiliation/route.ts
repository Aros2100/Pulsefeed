import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { normalizeCity } from "@/lib/geo/normalize";

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const admin = createAdminClient();

  // Only process authors that have at least one affiliation but haven't been
  // geo-resolved yet. Filter by geo_source='parser' AND country IS NULL so
  // human-set geo is never overwritten.
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
  const errors: string[] = [];


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
          city: parsed?.city ? normalizeCity(parsed.city) : null,
          country: parsed?.country ?? null,
          geo_source: "parser",
        })
        .eq("id", author.id);

      updated++;
    } catch (e) {
      const msg = `author ${author.id}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      console.error(`[backfill-affiliation] ${msg}`);
    }
  }

  const nextOffset = offset + batch.length;
  const done = batch.length < BATCH_SIZE;


  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    errors,
    nextOffset: done ? null : nextOffset,
    done,
    totalRemaining: count ?? null,
  });
}
