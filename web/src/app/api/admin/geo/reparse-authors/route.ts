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
    let lastId = "00000000-0000-0000-0000-000000000000";
    let updated = 0;
    let processed = 0;
    const BATCH = 200;

    while (true) {
      const { data } = await db
        .from("authors")
        .select("id, affiliations")
        .not("affiliations", "eq", "{}")
        .gt("id", lastId)
        .order("id", { ascending: true })
        .limit(BATCH);

      if (!data || data.length === 0) break;

      for (const author of data) {
        const raw = (author.affiliations as string[])?.[0] ?? null;
        const parsed = raw ? await geoParseAffiliation(raw) : null;

        await db.from("authors").update({
          country: parsed?.country ?? null,
          city: parsed?.city ?? null,
          hospital: parsed?.institution ?? null,
          department: parsed?.department ?? null,
        }).eq("id", author.id);
        updated++;
      }

      lastId = data[data.length - 1].id;
      processed += data.length;

      if (processed % 1000 < BATCH) {
      }

      if (data.length < BATCH) break;
    }

  });

  return NextResponse.json({ ok: true });
}
