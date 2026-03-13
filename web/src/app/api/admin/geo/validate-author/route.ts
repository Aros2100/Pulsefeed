import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const INST_KEYWORDS = [
  "hospital", "university", "institute", "medical", "clinic",
  "school", "college", "center", "centre", "department", "health",
];

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const cityFilters = INST_KEYWORDS.map((kw) => `city.ilike.%${kw}%`).join(",");
  const orFilter = `city.is.null,country.is.null,${cityFilters}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: author, error } = await (admin as any)
    .from("authors")
    .select("id, display_name, affiliations, city, country, hospital, department, state, article_count")
    .not("affiliations", "is", null)
    .neq("affiliations", "{}")
    .or(orFilter)
    .order("article_count", { ascending: false, nullsFirst: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!author || author.length === 0) {
    return NextResponse.json({ ok: true, author: null, remaining: 0 });
  }

  // Filter out authors that already have a lab_decision for author_geo
  const authorIds = author.map((a: { id: string }) => a.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: decisions } = await (admin as any)
    .from("lab_decisions")
    .select("article_id")
    .eq("module", "author_geo")
    .in("article_id", authorIds);

  const decidedSet = new Set((decisions ?? []).map((d: { article_id: string }) => d.article_id));
  const filtered = author.filter((a: { id: string }) => !decidedSet.has(a.id));

  if (filtered.length === 0) {
    return NextResponse.json({ ok: true, author: null, remaining: 0 });
  }

  const chosen = filtered[0];

  // Fetch articles for this author
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articleLinks } = await (admin as any)
    .from("article_authors")
    .select("article_id")
    .eq("author_id", chosen.id)
    .order("position", { ascending: true })
    .limit(5);

  let articles: { id: string; title: string; journal_title: string | null }[] = [];
  if (articleLinks && articleLinks.length > 0) {
    const articleIds = articleLinks.map((l: { article_id: string }) => l.article_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: arts } = await (admin as any)
      .from("articles")
      .select("id, title, journal_title")
      .in("id", articleIds);
    articles = arts ?? [];
  }

  return NextResponse.json({
    ok: true,
    author: chosen,
    articles,
    remaining: filtered.length,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { author_id, action, city, country, hospital, department, state } = body as {
    author_id: string;
    action: "approve" | "correct" | "insufficient_data";
    city?: string | null;
    country?: string | null;
    hospital?: string | null;
    department?: string | null;
    state?: string | null;
  };

  if (!author_id || !action) {
    return NextResponse.json({ ok: false, error: "Missing author_id or action" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch current author data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oldAuthor, error: fetchErr } = await (admin as any)
    .from("authors")
    .select("city, country, hospital, department, state")
    .eq("id", author_id)
    .single();

  if (fetchErr || !oldAuthor) {
    return NextResponse.json({ ok: false, error: "Author not found" }, { status: 404 });
  }

  const oldData = { city: oldAuthor.city, country: oldAuthor.country, hospital: oldAuthor.hospital, department: oldAuthor.department, state: oldAuthor.state };

  if (action === "insufficient_data") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("lab_decisions").insert({
      article_id: author_id,
      module: "author_geo",
      specialty: "neurosurgery",
      decision: "insufficient_data",
      ai_decision: JSON.stringify(oldData),
      disagreement_reason: null,
    });
    return NextResponse.json({ ok: true });
  }

  // approve or correct
  const newData = {
    city: city ?? null,
    country: country ?? null,
    hospital: hospital ?? null,
    department: department ?? null,
    state: state ?? null,
  };

  const changed = JSON.stringify(oldData) !== JSON.stringify(newData);

  // Save lab_decision
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("lab_decisions").insert({
    article_id: author_id,
    module: "author_geo",
    specialty: "neurosurgery",
    decision: JSON.stringify(newData),
    ai_decision: JSON.stringify(oldData),
    disagreement_reason: changed ? "corrected" : null,
  });

  // Update author with new values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("authors")
    .update({ city: newData.city, country: newData.country, hospital: newData.hospital, department: newData.department, state: newData.state })
    .eq("id", author_id);

  // If city was changed and old city matched institution keywords → create override
  if (changed && oldAuthor.city && newData.city !== oldAuthor.city) {
    const oldCityLower = (oldAuthor.city as string).toLowerCase();
    const isInstitutionCity = INST_KEYWORDS.some((kw) => oldCityLower.includes(kw));
    if (isInstitutionCity) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("geo_institution_overrides")
        .upsert({
          raw_segment: oldAuthor.city,
          city: newData.city,
          country: newData.country,
          institution: oldAuthor.city,
        }, { onConflict: "raw_segment" });
    }
  }

  return NextResponse.json({ ok: true });
}
