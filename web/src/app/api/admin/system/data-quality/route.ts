import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export async function GET() {
  try {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  // ── Overview ───────────────────────────────────────────────────────────────
  const [
    { count: total_articles },
    { data: lastImport },
    { data: lastLinking },
  ] = await Promise.all([
    admin.from("articles").select("*", { count: "exact", head: true }),
    admin.from("import_logs")
      .select("completed_at, articles_imported")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
    admin.from("author_linking_logs")
      .select("completed_at, articles_processed, new_authors, duplicates, rejected")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
  ]);

  const latestImport  = lastImport?.[0]  ?? null;
  const latestLinking = lastLinking?.[0] ?? null;

  // ── Awaiting linking (approved articles with no article_authors rows) ───────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: awaitingLinkingData } = await (admin as any).rpc("count_unlinked_articles");
  const awaiting_linking = (awaitingLinkingData as number) ?? 0;

  // ── Articles without authors (no article_authors rows at all) ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articlesWithoutAuthorsData } = await (admin as any).rpc("count_articles_without_authors");
  const articles_without_authors = (articlesWithoutAuthorsData as number) ?? 0;

  // ── Articles with author count mismatch ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articlesWithMismatchData } = await (admin as any).rpc("count_articles_with_mismatch");
  const articles_with_mismatch = (articlesWithMismatchData as number) ?? 0;

  // ── Author location stats ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authorStatsRows, error: authorStatsError } = await (admin as any).rpc("get_author_location_stats");
  if (authorStatsError) console.error("[data-quality] get_author_location_stats error:", authorStatsError);
  const authorStats = authorStatsRows?.[0] ?? {};

  // Fallback: direct count if RPC returns 0 (e.g. constraint violation, schema mismatch)
  let totalA = Number(authorStats.total_authors) || 0;
  if (totalA === 0) {
    const { count: directAuthorCount } = await admin
      .from("authors")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null);
    totalA = directAuthorCount ?? 0;
  }

  // ── Article location coverage ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [
    { count: art_with_country },
    { count: art_with_region },
    { count: art_with_city },
    { count: art_with_state },
    { count: art_not_parsed },
    { count: art_has_country_no_state },
    { count: art_has_country_no_city },
    { data: artSuspectCityData },
    { data: distinctRegionsData },
  ] = await Promise.all([
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_country", "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_region",  "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_city",    "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_state",   "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).is("location_parsed_at", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_country", "is", null).is("geo_state", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_country", "is", null).is("geo_city",  null),
    db.rpc("count_article_suspect_city_values"),
    db.rpc("count_distinct_geo_regions"),
  ]);
  const totalArt         = total_articles ?? 0;
  const art_suspect_city = (artSuspectCityData  as number) ?? 0;
  const distinct_regions = (distinctRegionsData as number) ?? 0;



  return NextResponse.json({
    overview: {
      total_articles:         total_articles ?? 0,
      total_authors:          totalA,
      last_import_at:         latestImport?.completed_at    ?? null,
      last_author_linking_at: latestLinking?.completed_at   ?? null,
    },
    import: {
      last_run_at:        latestImport?.completed_at  ?? null,
      articles_imported:  latestImport?.articles_imported ?? 0,
      total_articles:     total_articles ?? 0,
      awaiting_linking:   awaiting_linking ?? 0,
    },
    author_linking: {
      last_run_at:          latestLinking?.completed_at      ?? null,
      articles_processed:   latestLinking?.articles_processed ?? 0,
      new_authors:          latestLinking?.new_authors        ?? 0,
      existing:             latestLinking?.duplicates         ?? 0,
      rejected:             latestLinking?.rejected           ?? 0,
      articles_without_authors: articles_without_authors ?? 0,
      articles_with_mismatch:   articles_with_mismatch,
    },
    author_location: {
      with_region:          Number(authorStats.with_region)          || 0,
      with_country:         Number(authorStats.with_country)         || 0,
      with_state:           Number(authorStats.with_state)           || 0,
      with_city:            Number(authorStats.with_city)            || 0,
      distinct_regions:     Number(authorStats.distinct_regions)     || 0,
      no_region:            Number(authorStats.no_region)            || 0,
      no_country:           Number(authorStats.no_country)           || 0,
      no_state:             Number(authorStats.no_state)             || 0,
      no_city:              Number(authorStats.no_city)              || 0,
      no_geo:               Number(authorStats.no_geo)               || 0,
      affiliation_too_long: Number(authorStats.affiliation_too_long) || 0,
      suspect_city_values:  Number(authorStats.suspect_city_values)  || 0,
      source_ror:           Number(authorStats.source_ror)           || 0,
      source_parser:        Number(authorStats.source_parser)        || 0,
      verified_human:       Number(authorStats.verified_human)       || 0,
      with_region_pct:  totalA > 0 ? Math.round((Number(authorStats.with_region)  || 0) / totalA * 100) : 0,
      with_country_pct: totalA > 0 ? Math.round((Number(authorStats.with_country) || 0) / totalA * 100) : 0,
      with_state_pct:   totalA > 0 ? Math.round((Number(authorStats.with_state)   || 0) / totalA * 100) : 0,
      with_city_pct:    totalA > 0 ? Math.round((Number(authorStats.with_city)    || 0) / totalA * 100) : 0,
    },
    article_location: {
      with_region:      art_with_region         ?? 0,
      with_region_pct:  pct(art_with_region     ?? 0, totalArt),
      no_region:        totalArt - (art_with_region  ?? 0),
      with_country:     art_with_country        ?? 0,
      with_country_pct: pct(art_with_country    ?? 0, totalArt),
      no_country:       totalArt - (art_with_country ?? 0),
      with_state:       art_with_state          ?? 0,
      with_state_pct:   pct(art_with_state      ?? 0, totalArt),
      no_state:         art_has_country_no_state ?? 0,
      with_city:        art_with_city           ?? 0,
      no_city:          art_has_country_no_city  ?? 0,
      not_parsed:       art_not_parsed          ?? 0,
      suspect_city_values: art_suspect_city,
      distinct_regions,
    },
  });
  } catch (e) {
    console.error("[data-quality] route error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
