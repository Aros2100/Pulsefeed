import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation as geoParseAffiliation } from "@/lib/geo/affiliation-parser";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let offset = 0;
    let updated = 0;
    let processed = 0;
    const BATCH = 200;

    while (true) {
      const { data } = await db
        .from("authors")
        .select("id, affiliations")
        .not("affiliations", "eq", "{}")
        .range(offset, offset + BATCH - 1);

      if (!data || data.length === 0) break;

      for (const author of data) {
        const raw = (author.affiliations as string[])?.[0] ?? null;
        const parsed = raw ? geoParseAffiliation(raw) : null;
        if (!parsed) continue;

        await db.from("authors").update({
          country: parsed.country,
          city: parsed.city,
          hospital: parsed.institution,
          department: parsed.department,
        }).eq("id", author.id);
        updated++;
      }

      processed += data.length;
      offset += BATCH;

      if (processed % 1000 < BATCH) {
        console.log(`[reparse-authors] ${processed} processed, ${updated} updated`);
      }

      if (data.length < BATCH) break;
    }

    console.log(`[reparse-authors] done — ${processed} processed, ${updated} updated`);
  });

  return NextResponse.json({ ok: true });
}
