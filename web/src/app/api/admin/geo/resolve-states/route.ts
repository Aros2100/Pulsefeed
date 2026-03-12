import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupState } from "@/lib/geo/state-map";

const USER_AGENT = "PulseFeed/1.0 (morten@aabo.net)";
const NOMINATIM_DELAY = 1100; // ms between requests (rate limit: 1 req/s)

interface NominatimResult {
  address?: {
    state?: string;
  };
}

async function nominatimLookup(city: string, country: string): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    return data[0]?.address?.state ?? null;
  } catch {
    return null;
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Query distinct (city, country) pairs without state
  const { data: pairs } = await db
    .from("authors")
    .select("city, country")
    .not("city", "is", null)
    .not("country", "is", null)
    .is("state", null);

  // Deduplicate
  const uniqueMap = new Map<string, { city: string; country: string }>();
  for (const p of (pairs ?? [])) {
    const key = `${(p.city as string).toLowerCase()}||${(p.country as string).toLowerCase()}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, { city: p.city as string, country: p.country as string });
    }
  }

  // Check which are already cached
  const allPairs = [...uniqueMap.values()];
  const { data: cachedRows } = await db
    .from("geo_city_state_cache")
    .select("city, country");

  const cachedSet = new Set(
    (cachedRows ?? []).map((r: { city: string; country: string }) =>
      `${r.city.toLowerCase()}||${r.country.toLowerCase()}`
    )
  );

  const uncached = allPairs.filter(
    (p) => !cachedSet.has(`${p.city.toLowerCase()}||${p.country.toLowerCase()}`)
  );

  after(async () => {
    let looked = 0;
    let fromMap = 0;
    let fromNominatim = 0;
    let nullResults = 0;

    for (const pair of uncached) {
      // 1. Try hardcoded state-map first
      const mapState = lookupState(pair.city, pair.country);
      if (mapState) {
        await db.from("geo_city_state_cache").upsert(
          { city: pair.city.toLowerCase(), country: pair.country, state: mapState },
          { onConflict: "city,country" }
        );
        fromMap++;
        looked++;
        if (looked % 50 === 0) {
          console.log(`[resolve-states] ${looked}/${uncached.length} — map:${fromMap} nominatim:${fromNominatim} null:${nullResults}`);
        }
        continue;
      }

      // 2. Nominatim lookup
      const state = await nominatimLookup(pair.city, pair.country);
      await db.from("geo_city_state_cache").upsert(
        { city: pair.city.toLowerCase(), country: pair.country, state },
        { onConflict: "city,country" }
      );

      if (state) fromNominatim++;
      else nullResults++;
      looked++;

      if (looked % 50 === 0) {
        console.log(`[resolve-states] ${looked}/${uncached.length} — map:${fromMap} nominatim:${fromNominatim} null:${nullResults}`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, NOMINATIM_DELAY));
    }

    console.log(`[resolve-states] lookups done — ${looked} total, map:${fromMap}, nominatim:${fromNominatim}, null:${nullResults}`);

    // 3. Backfill authors.state from cache
    const { count: authorsUpdated } = await db.rpc("backfill_author_states");
    console.log(`[resolve-states] authors backfilled: ${authorsUpdated ?? "rpc not available, using manual update"}`);

    // Manual fallback if RPC doesn't exist
    if (authorsUpdated == null) {
      const { data: cacheRows } = await db
        .from("geo_city_state_cache")
        .select("city, country, state")
        .not("state", "is", null);

      let authUpdated = 0;
      for (const row of (cacheRows ?? [])) {
        const { count } = await db
          .from("authors")
          .update({ state: row.state })
          .is("state", null)
          .ilike("city", row.city)
          .ilike("country", row.country)
          .select("id", { count: "exact", head: true });
        authUpdated += count ?? 0;
      }
      console.log(`[resolve-states] authors backfilled (manual): ${authUpdated}`);
    }

    // 4. Backfill articles.geo_state from first author's state
    // Find articles without geo_state, get first author's state
    const { data: articleUpdates } = await db
      .from("article_authors")
      .select("article_id, authors!inner(state)")
      .not("authors.state", "is", null)
      .order("position", { ascending: true });

    // Deduplicate: keep only first author per article
    const articleStateMap = new Map<string, string>();
    for (const row of (articleUpdates ?? [])) {
      const artId = row.article_id as string;
      const state = (row.authors as { state: string })?.state;
      if (state && !articleStateMap.has(artId)) {
        articleStateMap.set(artId, state);
      }
    }

    let artUpdated = 0;
    const BATCH = 100;
    const entries = [...articleStateMap.entries()];
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      for (const [articleId, state] of batch) {
        const { error } = await db
          .from("articles")
          .update({ geo_state: state })
          .eq("id", articleId)
          .is("geo_state", null);
        if (!error) artUpdated++;
      }
      if (artUpdated % 200 === 0 && artUpdated > 0) {
        console.log(`[resolve-states] articles backfilled: ${artUpdated}`);
      }
    }

    console.log(`[resolve-states] done — articles backfilled: ${artUpdated}`);
  });

  return NextResponse.json({ ok: true, pairsToLookup: uncached.length });
}
