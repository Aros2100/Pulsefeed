import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupState } from "@/lib/geo/state-map";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const SUPPORTED_COUNTRIES = [
    "United States", "China", "Japan", "India", "Canada",
    "Brazil", "Australia", "South Korea", "Germany",
    "United Kingdom", "France", "Italy", "Spain",
  ];

  const { data: articles, error } = await db
    .from("articles")
    .select("id, geo_city, geo_country")
    .is("geo_state", null)
    .not("geo_city", "is", null)
    .in("geo_country", SUPPORTED_COUNTRIES)
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (articles ?? []) as { id: string; geo_city: string; geo_country: string }[];

  let updated = 0;
  let skipped = 0;
  const CHUNK_SIZE = 100;
  const updates: { id: string; state: string }[] = [];

  for (const row of rows) {
    const state = lookupState(row.geo_city, row.geo_country);
    if (state) {
      updates.push({ id: row.id, state });
    } else {
      skipped++;
    }
  }

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) =>
        db.from("articles").update({ geo_state: u.state }).eq("id", u.id)
      )
    );
    updated += chunk.length;
  }

  return NextResponse.json({ updated, skipped, total: rows.length });
}
