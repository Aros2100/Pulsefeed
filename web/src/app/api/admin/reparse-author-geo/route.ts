import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { resolveCityAlias } from "@/lib/geo/city-aliases";
import { lookupState } from "@/lib/geo/state-map";

const BATCH_SIZE = 50;

export async function POST() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Always fetch the next BATCH_SIZE authors that still match the filter.
  // No offset — rows leave the pool as city gets filled in, so offset is meaningless.
  const { data: authors, error, count } = await admin
    .from("authors")
    .select("id, affiliations", { count: "exact" })
    .is("city", null)
    .is("deleted_at", null)
    .not("affiliations", "is", null)
    .not("affiliations", "eq", "{}")
    .or("geo_source.eq.parser,geo_source.is.null")
    .not("geo_locked_by", "eq", "human")
    .not("geo_locked_by", "eq", "user")
    .limit(BATCH_SIZE)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const totalRemaining = count ?? 0;
  const batch = authors ?? [];

  console.log(`[reparse-geo] count=${count} batch.length=${batch.length}`);

  // ── Trin 1: Parse hele batchen parallelt ──────────────────────────────────
  const parsedResults = await Promise.all(
    batch.map(a => {
      const affiliations = a.affiliations as string[] | null;
      return affiliations?.length ? parseAffiliation(affiliations[0]) : Promise.resolve(null);
    })
  );

  // ── Trin 2: Saml unikke (city, country)-par der skal state-resolves ───────
  const pairs = [...new Set(
    parsedResults
      .filter(p => p?.city && p?.country)
      .map(p => `${p!.city!.toLowerCase()}|${p!.country!}`)
  )];

  // ── Trin 3: Ét enkelt DB-kald mod geo_city_state_cache ───────────────────
  const stateMap = new Map<string, string | null>();
  if (pairs.length > 0) {
    const uniqueCities = [...new Set(pairs.map(p => p.split("|")[0]))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (admin as any)
      .from("geo_city_state_cache")
      .select("city, country, state")
      .in("city", uniqueCities);
    for (const row of cached ?? []) {
      stateMap.set(`${row.city}|${row.country}`, row.state ?? null);
    }
  }

  // ── Trin 4: Manglende par → lookupState() + batch-upsert ─────────────────
  const missing = pairs.filter(p => !stateMap.has(p));
  if (missing.length > 0) {
    const upserts = missing.map(p => {
      const [city, country] = p.split("|");
      const state = lookupState(city, country);
      stateMap.set(p, state);
      return { city, country, state };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("geo_city_state_cache")
      .upsert(upserts, { onConflict: "city,country" });
  }

  // ── Trin 5: Opdater forfattere ────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < batch.length; i++) {
    const author = batch[i];
    const parsed = parsedResults[i];

    if (!parsed) {
      skipped++;
      continue;
    }

    try {
      const city    = parsed.city    ? await resolveCityAlias(parsed.city, parsed.country ?? "") : null;
      const country = parsed.country ?? null;
      const state   = city && country
        ? (stateMap.get(`${city.toLowerCase()}|${country}`) ?? null)
        : null;

      await admin
        .from("authors")
        .update({
          department: parsed.department ?? null,
          hospital:   parsed.institution ?? null,
          city,
          country,
          state,
          geo_source: "parser",
        })
        .eq("id", author.id);

      updated++;
    } catch {
      skipped++;
    }
  }

  const done = totalRemaining === 0;
  console.log(`[reparse-geo] updated=${updated} skipped=${skipped} done=${done} totalRemaining=${totalRemaining}`);

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    done,
    totalRemaining,
  });
}
