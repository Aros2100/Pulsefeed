import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { aiParseAffiliation } from "@/lib/geo/ai-location-parser";
import { normalizeCity } from "@/lib/geo/normalize";

const BATCH_SIZE = 200;
const DELAY_MS = 1300;

const INST_KEYWORDS = [
  "hospital", "university", "institute", "medical", "clinic",
  "school", "college", "center", "centre", "department", "health",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  // Build OR filter for city containing institution keywords
  const cityFilters = INST_KEYWORDS.map((kw) => `city.ilike.%${kw}%`).join(",");
  const orFilter = `city.is.null,country.is.null,${cityFilters}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authors, error } = await (admin as any)
    .from("authors")
    .select("id, affiliations")
    .eq("ai_geo_parsed", false)
    .not("affiliations", "is", null)
    .neq("affiliations", "{}")
    .or(orFilter)
    .order("article_count", { ascending: false, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const toProcess = (authors ?? []) as { id: string; affiliations: string[] }[];

  after(async () => {
    let updated = 0;
    let skipped = 0;

    for (const author of toProcess) {
      const aff = author.affiliations?.[0];
      if (!aff) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("authors")
          .update({ ai_geo_parsed: true })
          .eq("id", author.id);
        skipped++;
        continue;
      }

      try {
        const result = await aiParseAffiliation(aff);

        if (result) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from("authors")
            .update({
              city: normalizeCity(result.city),
              country: result.country,
              hospital: result.institution,
              department: result.department,
              state: result.state,
              ai_geo_parsed: true,
            })
            .eq("id", author.id);
          updated++;
        } else {
          // AI returned null — mark as parsed to skip next time
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from("authors")
            .update({ ai_geo_parsed: true })
            .eq("id", author.id);
          skipped++;
        }
      } catch (e) {
        console.error(`[ai-parse-authors] error for author ${author.id}:`, e);
        // Mark as parsed even on error to avoid infinite retries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("authors")
          .update({ ai_geo_parsed: true })
          .eq("id", author.id);
        skipped++;
      }

      await sleep(DELAY_MS);
    }

  });

  return NextResponse.json({ ok: true, queued: toProcess.length });
}
