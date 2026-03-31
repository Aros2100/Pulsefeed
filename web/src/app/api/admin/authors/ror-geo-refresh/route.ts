import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRorGeo } from "@/lib/import/forfatter-import/geo-decision";
import { getRegion, getContinent } from "@/lib/geo/continent-map";

const schema = z.object({
  offset: z.number().int().min(0).default(0),
  limit:  z.number().int().min(1).max(500).default(150),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authors, error: fetchError } = await (admin as any)
    .from("authors")
    .select("id, ror_id")
    .not("ror_id", "is", null)
    .order("id")
    .range(offset, offset + limit - 1);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const rows = (authors ?? []) as { id: string; ror_id: string }[];
  const limiter = pLimit(2);

  let updated = 0;
  let skipped = 0;

  await Promise.all(
    rows.map((author) =>
      limiter(async () => {
        await new Promise((r) => setTimeout(r, 300));
        const geo = await fetchRorGeo(author.ror_id);

        if (!geo.city && !geo.country) {
          skipped++;
          return;
        }

        const region    = geo.country ? getRegion(geo.country)            : null;
        const continent = region      ? getContinent(region)              : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: Record<string, any> = {
          geo_source:  "ror",
          verified_by: "openalex",
        };
        if (geo.city)    update.city      = geo.city;
        if (geo.state)   update.state     = geo.state;
        if (geo.country) update.country   = geo.country;
        if (region)      update.region    = region;
        if (continent)   update.continent = continent;

        const { error: updateError } = await admin.from("authors").update(update).eq("id", author.id);
        if (!updateError) updated++;
      })
    )
  );

  const nextOffset = offset + rows.length;
  const done       = rows.length < limit;

  return NextResponse.json({
    ok:         true,
    processed:  rows.length,
    updated,
    skipped,
    nextOffset,
    done,
  });
}
