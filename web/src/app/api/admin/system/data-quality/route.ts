import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export async function GET() {
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
  const { count: awaiting_linking } = await admin
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .not("id", "in", `(select distinct article_id from article_authors)`);

  // ── Still unlinked (approved articles with no linked author that has country) ─
  const { count: still_unlinked } = await admin
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .not("id", "in", `(select distinct article_id from article_authors aa join authors a on a.id = aa.author_id where a.country is not null)`);

  // ── Geo extraction ─────────────────────────────────────────────────────────
  const [
    { count: with_country },
    { count: with_city },
    { count: no_geo },
    { count: affiliation_no_geo_parser },
    { count: affiliation_no_geo_openalex },
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
      .not("affiliations", "is", null)
      .is("country", null)
      .eq("geo_source", "parser"),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("affiliations", "is", null)
      .is("country", null)
      .eq("geo_source", "openalex"),
  ]);

  // with_country + no_geo = all non-deleted authors (exact, since every author either has country or doesn't)
  const totalA = (with_country ?? 0) + (no_geo ?? 0);

  // ── OpenAlex ───────────────────────────────────────────────────────────────
  const [
    { count: with_ror_id },
    { count: geo_source_openalex },
  ] = await Promise.all([
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("ror_id", "is", null),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("geo_source", "openalex"),
  ]);

  // ── Geo quality ───────────────────────────────────────────────────────────
  const [
    { data: uniqueCitiesData },
    { count: suspect_city_values },
    { count: country_no_city },
  ] = await Promise.all([
    admin.from("authors")
      .select("city")
      .is("deleted_at", null)
      .not("city", "is", null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("authors")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("city", "is", null)
      .or("city.ilike.%0%,city.ilike.%1%,city.ilike.%2%,city.ilike.%3%,city.ilike.%4%,city.ilike.%5%,city.ilike.%6%,city.ilike.%7%,city.ilike.%8%,city.ilike.%9%"),
    admin.from("authors").select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("country", "is", null)
      .is("city", null),
  ]);

  const unique_cities = new Set(
    (uniqueCitiesData ?? []).map((r: { city: string | null }) => r.city).filter(Boolean)
  ).size;

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
      still_unlinked:       still_unlinked ?? 0,
    },
    geo_extraction: {
      with_country:       with_country     ?? 0,
      with_country_pct:   pct(with_country ?? 0, totalA),
      with_city:          with_city        ?? 0,
      with_city_pct:      pct(with_city    ?? 0, totalA),
      no_geo:                     no_geo                      ?? 0,
      no_geo_pct:                 pct(no_geo                  ?? 0, totalA),
      affiliation_no_geo_parser:  affiliation_no_geo_parser   ?? 0,
      affiliation_no_geo_openalex: affiliation_no_geo_openalex ?? 0,
    },
    openalex: {
      with_ror_id:              with_ror_id              ?? 0,
      with_ror_id_pct:          pct(with_ror_id          ?? 0, totalA),
      geo_source_openalex:      geo_source_openalex      ?? 0,
      geo_source_openalex_pct:  pct(geo_source_openalex  ?? 0, totalA),
    },
    geo_quality: {
      unique_cities,
      suspect_city_values: suspect_city_values ?? 0,
      country_no_city:     country_no_city     ?? 0,
      normalization: {
        last_run_at:           null,
        authors_normalized:    3216,
        duplicates_collapsed:  62,
        remaining_variants:    0,
      },
    },
  });
}
