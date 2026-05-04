export interface Edition {
  id: string;
  week_number: number;
  year: number;
  status: string;
  specialty: string;
  published_at: string | null;
}

export interface SubspecialtyBlock {
  id: string;
  name: string;
  short_name: string | null;
  sort_order: number;
  pick_count: number;
}

export interface EditionArticle {
  ea_id: string;       // newsletter_edition_articles.id
  article_id: string;
  sort_order: number;
  global_sort_order: number | null;
  is_global: boolean;
  subspecialty: string | null;
  newsletter_headline: string | null;
  newsletter_subheadline: string | null;
  title: string;
  pubmed_id: string | null;
  pubmed_indexed_at: string | null;
  article_type: string | null;
  journal_abbr: string | null;
  sari_subject: string | null;
}

export interface AllModeArticle {
  id: string;
  title: string;
  pubmed_id: string | null;
  pubmed_indexed_at: string | null;
  article_type: string | null;
  journal_abbr: string | null;
  editors_pick: boolean;
}

export interface SidebarData {
  specialty_pick_count: number;
  subspecialties: SubspecialtyBlock[];
}

/** Convert a subspecialty name to a URL-safe block slug */
export function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Reverse: find a subspecialty by slug */
export function slugToName(slug: string, subs: SubspecialtyBlock[]): string | null {
  const norm = slug.toLowerCase();
  return subs.find(s => nameToSlug(s.name) === norm)?.name ?? null;
}

/** ISO week Monday for week_number + year */
export function isoWeekMonday(weekNumber: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (weekNumber - 1) * 7);
  return monday;
}

export function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}
