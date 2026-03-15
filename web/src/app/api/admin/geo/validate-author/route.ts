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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const SELECT = "id, display_name, affiliations, city, country, hospital, department, state, article_count";

  // Hent næste uverificerede forfatter – flest artikler først
  const { data: candidates } = await admin
    .from("authors")
    .select(SELECT)
    .eq("verified_by", "uverificeret")
    .order("article_count", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, author: null, remaining: 0 });
  }

  // Filtrer allerede behandlede (lab_decisions)
  const authorIds = candidates.map((a: { id: string }) => a.id);
  const { data: decisions } = await admin
    .from("lab_decisions")
    .select("author_id")
    .eq("module", "author_geo")
    .in("author_id", authorIds);

  const decidedSet = new Set((decisions ?? []).map((d: { author_id: string }) => d.author_id));
  const filtered = candidates.filter((a: { id: string }) => !decidedSet.has(a.id));

  if (filtered.length === 0) {
    return NextResponse.json({ ok: true, author: null, remaining: 0 });
  }

  const chosen = filtered[0];

  // Fetch articles for this author
  const { data: articleLinks } = await admin
    .from("article_authors")
    .select("article_id")
    .eq("author_id", chosen.id)
    .order("position", { ascending: true })
    .limit(5);

  let articles: { id: string; title: string; journal_title: string | null }[] = [];
  if (articleLinks && articleLinks.length > 0) {
    const articleIds = articleLinks.map((l: { article_id: string }) => l.article_id);
    const { data: arts } = await admin
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
    priority: 0,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  console.log("[validate-author] body:", JSON.stringify(body));
  const { author_id, action, city, country, hospital, department, state, verified_by } = body as {
    author_id: string;
    action: "approve" | "correct" | "insufficient_data" | "duplicate" | "audit_flagged";
    city?: string | null;
    country?: string | null;
    hospital?: string | null;
    department?: string | null;
    state?: string | null;
    verified_by?: string | null;
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

  if (action === "insufficient_data" || action === "duplicate" || action === "audit_flagged") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertData, error: insertError } = await (admin as any).from("lab_decisions").insert({
      author_id: author_id,
      module: "author_geo",
      specialty: "neurosurgery",
      decision: action,
      ai_decision: JSON.stringify(oldData),
      disagreement_reason: null,
    });
    console.log("[validate-author] insert result:", JSON.stringify(insertData));
    if (insertError) console.log("[validate-author] insert error:", insertError);
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
  const { data: insertData, error: insertError } = await (admin as any).from("lab_decisions").insert({
    author_id: author_id,
    module: "author_geo",
    specialty: "neurosurgery",
    decision: JSON.stringify(newData),
    ai_decision: JSON.stringify(oldData),
    disagreement_reason: changed ? "corrected" : null,
  });
  console.log("[validate-author] insert result:", JSON.stringify(insertData));
  if (insertError) console.log("[validate-author] insert error:", insertError);

  // Update author with new values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("authors")
    .update({
      city:        newData.city,
      country:     newData.country,
      hospital:    newData.hospital,
      department:  newData.department,
      state:       newData.state,
      ...(verified_by ? { verified_by } : {}),
    })
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
