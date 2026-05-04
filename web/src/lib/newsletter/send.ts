import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { renderNewsletterHtml, type RenderParams, type RenderArticle, type SubspecialtyBlock } from "./render";

const FROM = process.env.NEWSLETTER_FROM_EMAIL ?? "PulseFeeds <newsletter@pulsefeeds.com>";

// ── Legacy type aliases (kept for HomeV1 compatibility) ──────────────────────

export interface NewsletterArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  article_type: string | null;
  short_resume: string | null;
  pubmed_id: string | null;
}

export interface NewsletterContent {
  general: NewsletterArticle[];
  subspecialties: { name: string; articles: NewsletterArticle[] }[];
}

// ── Week helpers ─────────────────────────────────────────────────────────────

export function isoWeekMonday(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return monday;
}

export function isoWeekSaturday(week: number, year: number): Date {
  const monday = isoWeekMonday(week, year);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  return saturday;
}

function isoWeekEnd(week: number, year: number): string {
  const monday = isoWeekMonday(week, year);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return sunday.toISOString().slice(0, 10) + "T23:59:59.999Z";
}

// ── Distribution logic ───────────────────────────────────────────────────────

function acrossLeadCount(userSubCount: number): number {
  return Math.max(1, 5 - userSubCount);
}

// ── buildRenderParams ─────────────────────────────────────────────────────────

type EditionRow = {
  id: string; week_number: number; year: number;
  and_finally_article_id: string | null;
  and_finally_headline: string | null;
  and_finally_subheadline: string | null;
};

type EditionArticleRow = {
  id: string; article_id: string; subspecialty: string;
  sort_order: number; is_global: boolean; global_sort_order: number | null;
  newsletter_headline: string | null; newsletter_subheadline: string | null;
  pubmed_id: string; article_type: string | null; journal_abbr: string | null;
  title: string; short_headline: string | null;
};

function toRenderArticle(row: EditionArticleRow): RenderArticle {
  return {
    pubmed_id:               row.pubmed_id,
    newsletter_headline:     row.newsletter_headline || row.short_headline || row.title,
    newsletter_subheadline:  row.newsletter_subheadline ?? "",
    article_type:            row.article_type,
    journal_abbr:            row.journal_abbr,
  };
}

export async function buildRenderParams(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any,
  editionId: string,
  userId: string,
  trackingPixelUrl: string | null,
  options?: { previewSubNames?: string[] }
): Promise<RenderParams | { error: string }> {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.pulsefeeds.com";

  // Load edition
  const { data: edition, error: editionErr } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, and_finally_article_id, and_finally_headline, and_finally_subheadline")
    .eq("id", editionId)
    .single();

  if (editionErr || !edition) return { error: "Edition not found" };
  const ed = edition as EditionRow;

  const { week_number, year } = ed;
  const weekStart = isoWeekMonday(week_number, year).toISOString().slice(0, 10);
  const weekEnd   = isoWeekEnd(week_number, year);
  const issueDate = isoWeekSaturday(week_number, year);

  // Load user
  let userSubs: string[];
  let firstName: string | null;
  let unsubscribeToken: string;

  if (options?.previewSubNames) {
    userSubs         = options.previewSubNames;
    firstName        = null;
    unsubscribeToken = "";
  } else {
    const { data: userRow } = await admin
      .from("users")
      .select("first_name, subspecialties, unsubscribe_token")
      .eq("id", userId)
      .maybeSingle();

    firstName        = (userRow as { first_name?: string | null })?.first_name ?? null;
    unsubscribeToken = (userRow as { unsubscribe_token?: string | null })?.unsubscribe_token ?? "";
    const rawSubs    = (userRow as { subspecialties?: unknown })?.subspecialties;
    userSubs         = Array.isArray(rawSubs)
      ? rawSubs.filter((s: unknown): s is string => typeof s === "string" && s !== "Neurosurgery")
      : [];
  }

  // Load subspecialty metadata (ordered) for user's subs
  const { data: subMeta } = await admin
    .from("subspecialties")
    .select("name, short_name")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true)
    .in("name", userSubs.length > 0 ? userSubs : ["__none__"])
    .order("sort_order");

  const orderedUserSubs: { name: string; short_name: string | null }[] =
    (subMeta ?? []) as { name: string; short_name: string | null }[];

  // Load edition articles
  const { data: rawArticles, error: artErr } = await admin
    .from("newsletter_edition_articles")
    .select(`
      id, article_id, subspecialty, sort_order, is_global, global_sort_order,
      newsletter_headline, newsletter_subheadline,
      articles!inner(pubmed_id, article_type, journal_abbr, title, short_headline)
    `)
    .eq("edition_id", editionId)
    .order("sort_order");

  if (artErr) return { error: `Failed to load articles: ${artErr.message}` };

  const articles: EditionArticleRow[] = ((rawArticles ?? []) as Record<string, unknown>[]).map((row) => {
    const a = row.articles as Record<string, unknown>;
    return {
      id:                    row.id as string,
      article_id:            row.article_id as string,
      subspecialty:          row.subspecialty as string,
      sort_order:            row.sort_order as number,
      is_global:             row.is_global as boolean,
      global_sort_order:     row.global_sort_order as number | null,
      newsletter_headline:   row.newsletter_headline as string | null,
      newsletter_subheadline: row.newsletter_subheadline as string | null,
      pubmed_id:             a.pubmed_id as string,
      article_type:          a.article_type as string | null,
      journal_abbr:          a.journal_abbr as string | null,
      title:                 a.title as string,
      short_headline:        a.short_headline as string | null,
    };
  });

  // Build globals and sub articles
  const globals = articles
    .filter((a) => a.is_global)
    .sort((a, b) => (a.global_sort_order ?? 0) - (b.global_sort_order ?? 0));

  if (globals.length === 0) return { error: "No global articles selected for this edition" };

  const hero = toRenderArticle(globals[0]);
  const nAcross = acrossLeadCount(orderedUserSubs.length);
  const acrossLeads = globals.slice(1, 1 + nAcross).map(toRenderArticle);
  const acrossMoreCount = Math.max(0, globals.length - 1 - nAcross);

  const subspecialtyBlocks: SubspecialtyBlock[] = orderedUserSubs.map((sub) => {
    const subRows = articles
      .filter((a) => !a.is_global && a.subspecialty === sub.name)
      .sort((a, b) => a.sort_order - b.sort_order);
    const lead = subRows[0] ? toRenderArticle(subRows[0]) : null;
    const moreCount = lead ? subRows.length - 1 : 0;
    return {
      name:      sub.name,
      short_name: sub.short_name,
      lead,
      more_count: moreCount,
      more_url: moreCount > 0
        ? `${SITE_URL}/feed?week=${week_number}&year=${year}&subspecialty=${encodeURIComponent(sub.name)}`
        : null,
    };
  });

  // And finally
  let andFinally = null;
  if (ed.and_finally_article_id && ed.and_finally_headline && ed.and_finally_subheadline) {
    const { data: afArt } = await admin
      .from("articles")
      .select("pubmed_id, article_type, journal_abbr")
      .eq("id", ed.and_finally_article_id)
      .single();
    if (afArt) {
      andFinally = {
        pubmed_id:              (afArt as { pubmed_id: string }).pubmed_id,
        newsletter_headline:    ed.and_finally_headline,
        newsletter_subheadline: ed.and_finally_subheadline,
        article_type:           (afArt as { article_type: string | null }).article_type,
        journal_abbr:           (afArt as { journal_abbr: string | null }).journal_abbr,
      };
    }
  }

  // Feature promo
  const { data: promoRow } = await admin
    .from("newsletter_feature_promos")
    .select("label, headline, description, cta_text, cta_url")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const featurePromo = promoRow
    ? { label: (promoRow as { label: string }).label, headline: (promoRow as { headline: string }).headline,
        description: (promoRow as { description: string }).description, cta_text: (promoRow as { cta_text: string }).cta_text,
        cta_url: (promoRow as { cta_url: string }).cta_url }
    : null;

  // PubMed counts
  const { data: weekArts } = await admin
    .from("articles")
    .select("id, subspecialty")
    .gte("pubmed_indexed_at", weekStart)
    .lte("pubmed_indexed_at", weekEnd)
    .eq("circle", 1);

  const pubmedTotal: number = (weekArts ?? []).length;
  const pubmedBySub = orderedUserSubs.map((sub) => ({
    name:       sub.name,
    short_name: sub.short_name,
    count:      ((weekArts ?? []) as { subspecialty: string[] | null }[])
                  .filter((a) => (a.subspecialty ?? []).includes(sub.name)).length,
  }));

  // URLs
  const editionUrl    = `${SITE_URL}/edition/${week_number}/${year}`;
  const acrossMoreUrl = acrossMoreCount > 0
    ? `${SITE_URL}/feed?week=${week_number}&year=${year}&scope=global`
    : null;
  const preferencesUrl = `${SITE_URL}/account/preferences`;
  const forwardUrl     = `${SITE_URL}/edition/${week_number}/${year}?forward=1`;
  const unsubscribeUrl = unsubscribeToken
    ? `${SITE_URL}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${SITE_URL}/unsubscribe`;

  return {
    weekNumber: week_number,
    year,
    issueDate,
    firstName,
    hero,
    acrossLeads,
    acrossMoreCount,
    acrossMoreUrl,
    subspecialtyBlocks,
    pubmedTotal,
    pubmedBySub,
    editionUrl,
    andFinally,
    featurePromo,
    footerSubspecialtyShortNames: orderedUserSubs.map((s) => s.short_name ?? s.name),
    unsubscribeUrl,
    preferencesUrl,
    forwardUrl,
    trackingPixelUrl,
  };
}

// ── sendNewsletter ────────────────────────────────────────────────────────────

export async function sendNewsletter(
  editionId: string,
  userId: string,
  overrides?: { subject?: string; from?: string }
): Promise<{ ok: true; sendId: string } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.pulsefeeds.com";

  const [{ data: { user }, error: userErr }, { data: sendRow, error: insertErr }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("newsletter_sends").insert({ user_id: userId }).select("id, open_token").single(),
  ]);

  if (userErr || !user?.email) return { ok: false, error: userErr?.message ?? "User not found" };
  if (insertErr || !sendRow) return { ok: false, error: insertErr?.message ?? "Failed to create send record" };

  const trackingPixelUrl = `${SITE_URL}/api/track/open?t=${(sendRow as { open_token: string }).open_token}`;

  const paramsResult = await buildRenderParams(admin, editionId, userId, trackingPixelUrl);
  if ("error" in paramsResult) {
    await admin.from("newsletter_sends").delete().eq("id", (sendRow as { id: string }).id);
    return { ok: false, error: paramsResult.error };
  }

  const html = renderNewsletterHtml(paramsResult);

  const { edition } = await admin
    .from("newsletter_editions")
    .select("week_number, year")
    .eq("id", editionId)
    .single()
    .then((r: { data: { week_number: number; year: number } | null }) => ({ edition: r.data }));

  const subject = overrides?.subject
    ?? `PulseFeeds · Issue ${edition?.week_number ?? ""} · ${edition?.year ?? ""}`;
  const from = overrides?.from ?? FROM;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({ from, to: user.email, subject, html, replyTo: "hello@pulsefeeds.com" });

  if (emailErr) {
    await admin.from("newsletter_sends").delete().eq("id", (sendRow as { id: string }).id);
    return { ok: false, error: (emailErr as { message?: string }).message ?? "Email send failed" };
  }

  return { ok: true, sendId: (sendRow as { id: string }).id };
}
