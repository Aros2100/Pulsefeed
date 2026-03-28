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

  // ── Geo extraction ─────────────────────────────────────────────────────────
  const [
    { count: with_country },
    { count: with_city },
    { count: no_country },
    { count: no_city },
    { count: no_geo },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data: affiliation_too_long_data },
  ] = await Promise.all([
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("country", "is", null),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("city", "is", null),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("country", null),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("city", null),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("country", null)
      .is("city", null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_affiliation_too_long"),
  ]);
  const affiliation_too_long = (affiliation_too_long_data as number) ?? 0;

  // with_country + no_country = all non-deleted authors (exact, since every author either has country or doesn't)
  const totalA = (with_country ?? 0) + (no_country ?? 0);

  // ── Article location coverage ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [
    { count: art_with_country },
    { count: art_with_city },
    { count: art_not_parsed },
    { count: art_high_confidence },
    { count: art_low_confidence },
  ] = await Promise.all([
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_country", "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).not("geo_city",    "is", null),
    db.from("articles").select("*", { count: "exact", head: true }).is("location_parsed_at", null),
    db.from("articles").select("*", { count: "exact", head: true }).eq("location_confidence", "high"),
    db.from("articles").select("*", { count: "exact", head: true }).eq("location_confidence", "low"),
  ]);
  const totalArt = total_articles ?? 0;

  // ── Geo quality ───────────────────────────────────────────────────────────
  const [
    { count: suspect_city_values },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data: suspectCountryData },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data: countryAliasData },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data: cityAliasData },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("authors")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("city", "is", null)
      .or("city.ilike.%0%,city.ilike.%1%,city.ilike.%2%,city.ilike.%3%,city.ilike.%4%,city.ilike.%5%,city.ilike.%6%,city.ilike.%7%,city.ilike.%8%,city.ilike.%9%"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_suspect_country_values"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_country_alias_pairs"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_city_alias_pairs"),
  ]);
  const suspect_country_values = (suspectCountryData as number) ?? 0;
  const country_alias_pairs    = (countryAliasData   as number) ?? 0;
  const city_alias_pairs       = (cityAliasData      as number) ?? 0;


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
    geo_extraction: {
      with_country:        with_country     ?? 0,
      with_country_pct:    pct(with_country ?? 0, totalA),
      with_city:           with_city        ?? 0,
      with_city_pct:       pct(with_city    ?? 0, totalA),
      no_country:          no_country       ?? 0,
      no_city:             no_city          ?? 0,
      no_geo:              no_geo           ?? 0,
      affiliation_too_long: affiliation_too_long,
    },
    geo_quality: {
      suspect_city_values:    suspect_city_values    ?? 0,
      suspect_country_values: suspect_country_values,
      country_alias_pairs:    country_alias_pairs,
      city_alias_pairs:       city_alias_pairs,
    },
    article_location: {
      with_country:     art_with_country     ?? 0,
      with_country_pct: pct(art_with_country ?? 0, totalArt),
      with_city:        art_with_city        ?? 0,
      with_city_pct:    pct(art_with_city    ?? 0, totalArt),
      no_country:       totalArt - (art_with_country ?? 0),
      no_city:          totalArt - (art_with_city    ?? 0),
      not_parsed:       art_not_parsed       ?? 0,
      high_confidence:  art_high_confidence  ?? 0,
      low_confidence:   art_low_confidence   ?? 0,
    },
  });
  } catch (e) {
    console.error("[data-quality] route error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
