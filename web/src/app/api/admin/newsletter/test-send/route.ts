import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { renderNewsletterHtml, type Article, type Section } from "@/lib/newsletter/render";

const schema = z.object({
  editionId: z.string().min(1),
  email:     z.string().email(),
});

const FROM = "onboarding@resend.dev"; // TODO: switch to process.env.NEWSLETTER_FROM_EMAIL once domain is verified

function isoWeekInterval(weekNumber: number, year: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (weekNumber - 1) * 7);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekFrom: monday.toISOString().slice(0, 10),
    weekTo:   sunday.toISOString().slice(0, 10) + "T23:59:59.999Z",
    satLabel: saturday.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { editionId, email } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, content")
    .eq("id", editionId)
    .single();

  if (editionError || !edition) {
    return NextResponse.json({ ok: false, error: "Edition not found" }, { status: 404 });
  }

  const content = (edition.content ?? {}) as Record<string, unknown>;
  const globalIntro = typeof content.global_intro === "string" ? content.global_intro : "";
  const subspecialtyComments = (content.subspecialty_comments ?? {}) as Record<string, string>;

  const { weekFrom, weekTo, satLabel } = isoWeekInterval(edition.week_number, edition.year);

  const [
    { data: subspecialties },
    { data: editionArticles },
    { data: weekArticleRows },
  ] = await Promise.all([
    admin.from("subspecialties").select("id, name, sort_order").eq("specialty", ACTIVE_SPECIALTY).eq("active", true).order("sort_order"),
    admin.from("newsletter_edition_articles").select("id, article_id, subspecialty, sort_order, is_global").eq("edition_id", editionId).order("sort_order"),
    admin
      .from("articles")
      .select("id, subspecialty_ai, article_specialties!inner(specialty, specialty_match)")
      .eq("article_specialties.specialty", ACTIVE_SPECIALTY)
      .eq("article_specialties.specialty_match", true)
      .gte("pubmed_indexed_at", weekFrom)
      .lte("pubmed_indexed_at", weekTo)
      .limit(5000),
  ]);

  const pubmedTotal: number = (weekArticleRows ?? []).length;
  const pubmedBySubspecialty: Record<string, number> = {};
  for (const a of (weekArticleRows ?? []) as { subspecialty_ai: string[] | null }[]) {
    for (const sub of (a.subspecialty_ai ?? [])) {
      pubmedBySubspecialty[sub] = (pubmedBySubspecialty[sub] ?? 0) + 1;
    }
  }

  const articleIds = ((editionArticles ?? []) as { article_id: string }[]).map((ea) => ea.article_id);

  let articleDetails: { id: string; title: string; article_type: string | null; journal_abbr: string | null; pubmed_id: string }[] = [];
  let authorMap = new Map<string, { display_name: string | null; country: string | null }>();

  if (articleIds.length > 0) {
    const [{ data: articles }, { data: authorRows }] = await Promise.all([
      admin.from("articles").select("id, title, article_type, journal_abbr, pubmed_id").in("id", articleIds),
      admin.from("article_authors").select("article_id, authors!inner(display_name, country)").in("article_id", articleIds).eq("position", 1),
    ]);
    articleDetails = articles ?? [];
    authorMap = new Map(
      ((authorRows ?? []) as { article_id: string; authors: { display_name: string | null; country: string | null } }[])
        .map((r) => [r.article_id, r.authors])
    );
  }

  const detailMap = new Map(articleDetails.map((a) => [a.id, a]));

  function toArticle(ea: { article_id: string }): Article | null {
    const d = detailMap.get(ea.article_id);
    if (!d) return null;
    const author = authorMap.get(ea.article_id);
    const lastName = author?.display_name ? author.display_name.split(" ").pop() ?? null : null;
    return { title: d.title, article_type: d.article_type, journal_abbr: d.journal_abbr, pubmed_id: d.pubmed_id, authorLastName: lastName, country: author?.country ?? null };
  }

  const LIMIT = 3;
  const eas = (editionArticles ?? []) as { id: string; article_id: string; subspecialty: string; sort_order: number; is_global: boolean }[];

  const withArticles = new Set(eas.map((ea) => ea.subspecialty));
  const activeSubs = ((subspecialties ?? []) as { id: string; name: string; sort_order: number }[])
    .filter((s) => withArticles.has(s.name))
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3);

  const sections: Section[] = activeSubs.map((sub) => ({
    name: sub.name,
    comment: subspecialtyComments[sub.name] ?? "",
    articles: eas
      .filter((ea) => ea.subspecialty === sub.name)
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, LIMIT)
      .map(toArticle)
      .filter((a): a is Article => a !== null),
  }));

  const globalArticles = eas
    .filter((ea) => ea.is_global)
    .map(toArticle)
    .filter((a): a is Article => a !== null);

  const { data: profileRow } = await admin.from("users").select("first_name").eq("id", auth.userId).maybeSingle();
  const firstName: string = (profileRow as { first_name?: string | null } | null)?.first_name ?? "";

  const html = renderNewsletterHtml({ weekNumber: edition.week_number, year: edition.year, satLabel, firstName, pubmedTotal, pubmedBySubspecialty, globalIntro, sections, globalArticles });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `[TEST] PulseFeed Week ${edition.week_number} · ${edition.year}`,
    html,
  });

  if (emailErr) {
    return NextResponse.json({ ok: false, error: (emailErr as { message?: string }).message ?? "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
