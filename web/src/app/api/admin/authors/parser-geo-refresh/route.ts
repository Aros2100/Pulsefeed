import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { normalizeGeo } from "@/lib/geo/normalize-geo";
import { lookupState } from "@/lib/geo/state-map";
import { getRegion, getContinent } from "@/lib/geo/continent-map";

const schema = z.object({
  offset: z.number().int().min(0).default(0),
  limit:  z.number().int().min(1).max(500).default(50),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { offset, limit } = result.data;
  const admin = createAdminClient();

  // Fetch batch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authors, error: fetchError } = await (admin as any)
    .from("authors")
    .select("id, affiliations")
    .is("ror_id", null)
    .order("id")
    .range(offset, offset + limit - 1);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const rows = (authors ?? []) as { id: string; affiliations: string[] | null }[];
  const limiter = pLimit(10);

  let updated = 0;
  let skipped = 0;

  await Promise.all(
    rows.map((author) =>
      limiter(async () => {
        const aff = author.affiliations?.[0] ?? null;
        if (!aff) {
          skipped++;
          return;
        }

        const parsed = await parseAffiliation(aff);
        if (!parsed) {
          skipped++;
          return;
        }

        const geo       = normalizeGeo(parsed.city, parsed.country);
        const city      = geo.city    ?? null;
        const country   = geo.country ?? null;
        const state     = (city && country) ? lookupState(city, country) : null;
        const region    = country ? getRegion(country)    : null;
        const continent = region  ? getContinent(region)  : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: Record<string, any> = {
          geo_source:  "parser",
          verified_by: "parser",
          city:      city      ?? null,
          state:     state     ?? null,
          country:   country   ?? null,
          region:    region    ?? null,
          continent: continent ?? null,
        };

        await admin.from("authors").update(update).eq("id", author.id);
        updated++;
      })
    )
  );

  const nextOffset = offset + rows.length;
  const done       = rows.length < limit;

  return NextResponse.json({
    ok:        true,
    processed: rows.length,
    updated,
    skipped,
    nextOffset,
    done,
  });
}
