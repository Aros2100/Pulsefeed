import { XMLParser } from "fast-xml-parser";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEmail, stripEmailFromAffiliation } from "@/lib/affiliations";
import { parseAffiliation as geoParseAffiliation } from "@/lib/geo/affiliation-parser";
import { lookupState } from "@/lib/geo/state-map";
import { runArticleChecks } from "@/lib/pubmed/quality-checks";
import { logArticleEvent } from "@/lib/article-events";

type AdminClient = ReturnType<typeof createAdminClient>;

const BATCH_SIZE = 20;      // PubMed EFetch batch limit
const RATE_LIMIT_MS = 110;  // ~9 req/s — safely under PubMed's 10 req/s with API key
const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKey(): string {
  const key = process.env.PUBMED_API_KEY;
  if (!key) throw new Error("PUBMED_API_KEY is not configured");
  return key;
}

// ── XML helpers ────────────────────────────────────────────────────────────────

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function getText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

function parsePubYear(pubDate: unknown): number | null {
  if (!pubDate || typeof pubDate !== "object") return null;
  const pd = pubDate as Record<string, unknown>;
  const year = getText(pd.Year);
  if (year) return parseInt(year, 10);
  const med = getText(pd.MedlineDate);
  const m = med.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parsePubDateFull(pubDate: unknown): string | null {
  if (!pubDate || typeof pubDate !== "object") return null;
  const pd = pubDate as Record<string, unknown>;

  const year     = getText(pd.Year);
  const monthRaw = getText(pd.Month);
  const day      = getText(pd.Day);
  const med      = getText(pd.MedlineDate);

  const month = monthRaw ? (MONTHS[monthRaw.slice(0, 3)] ?? "01") : null;

  if (year && month && day)  return `${year}-${month}-${day.padStart(2, "0")}`;
  if (year && month)         return `${year}-${month}-01`;
  if (year)                  return `${year}-01-01`;

  // MedlineDate fallback: e.g. "2024 Jan-Feb" or "2024"
  const medMatch = med.match(/(\d{4})\s+([A-Za-z]{3})/);
  if (medMatch) return `${medMatch[1]}-${MONTHS[medMatch[2]] ?? "01"}-01`;
  const yearOnly = med.match(/(\d{4})/);
  return yearOnly ? `${yearOnly[1]}-01-01` : null;
}

function parseDateCompleted(dc: unknown): string | null {
  if (!dc || typeof dc !== "object") return null;
  const d = dc as Record<string, unknown>;
  const year = getText(d.Year);
  const month = getText(d.Month);
  const day = getText(d.Day);
  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// ── HTML entity decoding ───────────────────────────────────────────────────────

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Field parsers ──────────────────────────────────────────────────────────────

export interface Author {
  lastName: string;
  foreName: string;
  affiliations: string[];
  orcid: string | null;
}

export type AuthorOutcome = "new" | "duplicate" | "rejected";

function parseAuthors(authorList: unknown): Author[] {
  const raw = (authorList as Record<string, unknown> | undefined)?.Author;
  return toArray(raw).map((a) => {
    const r = a as Record<string, unknown>;
    const lastName = decodeHtmlEntities(getText(r.LastName));
    const foreName = decodeHtmlEntities(getText(r.ForeName) || getText(r.Initials));

    const affiliationInfos = toArray(r.AffiliationInfo);
    const affiliations = affiliationInfos
      .map((ai) => decodeHtmlEntities(getText((ai as Record<string, unknown>).Affiliation)))
      .filter(Boolean);

    const identifiers = toArray(r.Identifier);
    const orcidEntry = identifiers.find(
      (id) => (id as Record<string, unknown>)["@_Source"] === "ORCID"
    );
    const orcid = orcidEntry ? getText(orcidEntry) || null : null;

    return { lastName, foreName, affiliations, orcid };
  });
}

export interface MeshTerm {
  descriptor: string;
  major: boolean;
  qualifiers: string[];
}

function parseMeshTerms(meshHeadingList: unknown): MeshTerm[] {
  const raw = (meshHeadingList as Record<string, unknown> | undefined)?.MeshHeading;
  return toArray(raw).map((heading) => {
    const h = heading as Record<string, unknown>;
    const descriptorNode = h.DescriptorName as Record<string, unknown> | undefined;
    const descriptor = getText(descriptorNode);
    const major = descriptorNode?.["@_MajorTopicYN"] === "Y";
    const qualifiers = toArray(h.QualifierName).map(getText).filter(Boolean);
    return { descriptor, major, qualifiers };
  });
}

export interface Grant {
  grantId: string | null;
  agency: string | null;
}

function parseGrants(grantList: unknown): Grant[] {
  const raw = (grantList as Record<string, unknown> | undefined)?.Grant;
  return toArray(raw).map((grant) => {
    const g = grant as Record<string, unknown>;
    return {
      grantId: getText(g.GrantID) || null,
      agency: getText(g.Agency) || null,
    };
  });
}

export interface Substance {
  registryNumber: string | null;
  name: string;
}

function parseSubstances(chemicalList: unknown): Substance[] {
  const raw = (chemicalList as Record<string, unknown> | undefined)?.Chemical;
  return toArray(raw).map((chem) => {
    const c = chem as Record<string, unknown>;
    return {
      registryNumber: getText(c.RegistryNumber) || null,
      name: getText(c.NameOfSubstance),
    };
  });
}

// ── Author resolution ──────────────────────────────────────────────────────────

const OPENALEX_BASE = "https://api.openalex.org";
const OPENALEX_MAILTO = "digest@pulsefeed.dk";

function normalizeOrcid(orcid: string): string {
  return orcid.replace(/^https?:\/\/orcid\.org\//, "").trim();
}

function normalizeNameStr(name: string): string {
  return name.toLowerCase().replace(/[^a-z\u00c0-\u024f\s]/g, "").trim();
}

function computeMatchConfidence(
  author: Author,
  candidate: { display_name: string; affiliations: string[]; country?: string | null; city?: string | null },
  parsedGeo?: { country: string | null; city: string | null; institution: string | null },
): number {
  const authorFull = normalizeNameStr(`${author.foreName} ${author.lastName}`);
  const candidateFull = normalizeNameStr(candidate.display_name);

  let score = 0;

  const primaryAff = author.affiliations[0] ?? null;

  if (authorFull === candidateFull) {
    if (primaryAff && candidate.affiliations.length > 0) {
      const affLower = primaryAff.toLowerCase();
      const matched = candidate.affiliations.some((a) => {
        const al = a.toLowerCase();
        return al.includes(affLower.slice(0, 20)) || affLower.includes(al.slice(0, 20));
      });
      score = matched ? 0.95 : 0.85;
    } else {
      score = 0.85;
    }
  } else {
    const authorLast = normalizeNameStr(author.lastName);
    const authorFirstFull = normalizeNameStr(author.foreName);
    const authorFirstInitial = authorFirstFull.charAt(0);
    const parts = candidateFull.split(" ");
    const lastMatch = parts.some((p) => p === authorLast);
    const firstInitialMatch = authorFirstInitial && parts.some((p) => p.charAt(0) === authorFirstInitial);

    // Full first name match scores higher than initial-only match
    const firstFullMatch = authorFirstFull.length > 1 && parts.some((p) => p === authorFirstFull);

    if (lastMatch && firstFullMatch) {
      // Full name match — high confidence
      if (primaryAff && candidate.affiliations.length > 0) {
        const affLower = primaryAff.toLowerCase();
        const matched = candidate.affiliations.some((a) => {
          const al = a.toLowerCase();
          return al.includes(affLower.slice(0, 20)) || affLower.includes(al.slice(0, 20));
        });
        score = matched ? 0.90 : 0.80;
      } else {
        score = 0.80;
      }
    } else if (lastMatch && firstInitialMatch) {
      // Initial-only match — lower confidence, below threshold
      if (primaryAff && candidate.affiliations.length > 0) {
        const affLower = primaryAff.toLowerCase();
        const matched = candidate.affiliations.some((a) => {
          const al = a.toLowerCase();
          return al.includes(affLower.slice(0, 20)) || affLower.includes(al.slice(0, 20));
        });
        score = matched ? 0.80 : 0.60;
      } else {
        score = 0.60;
      }
    } else {
      return 0;
    }
  }

  // Geo boost
  if (parsedGeo?.country && candidate.country) {
    const countryMatch = parsedGeo.country.toLowerCase() === candidate.country.toLowerCase();
    if (countryMatch && score >= 0.80) score = Math.min(score + 0.05, 0.98);
    if (parsedGeo.city && candidate.city) {
      const cityMatch = parsedGeo.city.toLowerCase() === candidate.city.toLowerCase();
      if (cityMatch && score >= 0.80) score = Math.min(score + 0.05, 0.98);
    }
  }

  return score;
}

async function fetchOpenAlexId(
  orcid: string | null,
  name: string,
  affiliation: string | null
): Promise<string | null> {
  try {
    let filter: string;
    if (orcid) {
      filter = `orcid:${orcid}`;
    } else {
      filter = `display_name.search:${encodeURIComponent(name)}`;
      if (affiliation) {
        filter += `,affiliations.institution.display_name:${encodeURIComponent(affiliation.slice(0, 60))}`;
      }
    }
    const url = `${OPENALEX_BASE}/authors?filter=${filter}&mailto=${OPENALEX_MAILTO}&per_page=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      headers: { "User-Agent": `pulsefeed/1.0 (mailto:${OPENALEX_MAILTO})` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { id?: string }[] };
    const raw = data.results?.[0]?.id ?? null;
    return raw ? raw.replace("https://openalex.org/", "") : null;
  } catch {
    return null;
  }
}

async function resolveState(admin: AdminClient, city: string | null, country: string | null): Promise<string | null> {
  if (!city || !country) return null;
  // 1. Check cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = await (admin as any)
    .from("geo_city_state_cache")
    .select("state")
    .eq("city", city.toLowerCase())
    .eq("country", country)
    .maybeSingle();
  if (cached) return (cached.state as string | null) ?? null;
  // 2. Fallback to hardcoded map
  const mapState = lookupState(city, country);
  if (mapState) {
    // Insert into cache for future use
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("geo_city_state_cache").upsert(
      { city: city.toLowerCase(), country, state: mapState },
      { onConflict: "city,country" }
    );
  }
  return mapState;
}

async function resolveAuthorId(
  admin: AdminClient,
  author: Author
): Promise<{ id: string; outcome: AuthorOutcome }> {
  const displayName = [author.foreName, author.lastName].filter(Boolean).join(" ").trim();

  // 1. ORCID path
  if (author.orcid) {
    const orcid = normalizeOrcid(author.orcid);
    const { data: existing } = await admin
      .from("authors")
      .select("id")
      .eq("orcid", orcid)
      .maybeSingle();

    if (existing) return { id: existing.id, outcome: "duplicate" };

    await sleep(150); // polite rate limit for OpenAlex
    const primaryAff = author.affiliations[0] ?? null;
    const openalexId = await fetchOpenAlexId(orcid, displayName, primaryAff);
    const email = primaryAff ? extractEmail(primaryAff) : null;
    const affiliations = author.affiliations
      .map(a => stripEmailFromAffiliation(a))
      .filter((a): a is string => Boolean(a));
    const cleanAffiliation = affiliations[0] ?? null;
    const geoParsed = cleanAffiliation ? geoParseAffiliation(cleanAffiliation) : null;
    const authorState = await resolveState(admin, geoParsed?.city ?? null, geoParsed?.country ?? null);
    const parsed = {
      department: geoParsed?.department ?? null,
      hospital: geoParsed?.institution ?? null,
      city: geoParsed?.city ?? null,
      country: geoParsed?.country ?? null,
      state: authorState,
    };

    const { data: created } = await admin
      .from("authors")
      .insert({
        display_name: displayName || "Unknown",
        orcid,
        openalex_id: openalexId,
        email,
        affiliations,
        match_confidence: 1.0,
        ...parsed,
      })
      .select("id")
      .single();

    return { id: created!.id, outcome: "new" };
  }

  // 2. Fuzzy match path (no ORCID)
  if (author.lastName) {
    const { data: candidates } = await admin
      .from("authors")
      .select("id, display_name, affiliations, country, city")
      .ilike("display_name", `%${author.lastName}%`)
      .limit(50);

    const fuzzyPrimaryAff = author.affiliations[0] ?? null;
    const fuzzyGeoParsed = fuzzyPrimaryAff ? geoParseAffiliation(fuzzyPrimaryAff) : null;
    const fuzzyGeo = fuzzyGeoParsed ? { country: fuzzyGeoParsed.country, city: fuzzyGeoParsed.city, institution: fuzzyGeoParsed.institution } : undefined;

    let bestId: string | null = null;
    let bestScore = 0;
    for (const c of candidates ?? []) {
      const score = computeMatchConfidence(author, {
        display_name: c.display_name,
        affiliations: (c.affiliations as string[]) ?? [],
        country: c.country,
        city: c.city,
      }, fuzzyGeo);
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }

    if (bestScore >= 0.85 && bestId) return { id: bestId, outcome: "duplicate" };
  }

  // 3. No match — create new author
  await sleep(150);
  const newPrimaryAff = author.affiliations[0] ?? null;
  const openalexId = await fetchOpenAlexId(null, displayName, newPrimaryAff);
  const email = newPrimaryAff ? extractEmail(newPrimaryAff) : null;
  const affiliations = author.affiliations
    .map(a => stripEmailFromAffiliation(a))
    .filter((a): a is string => Boolean(a));
  const cleanAffiliation = affiliations[0] ?? null;
  const geoParsed = cleanAffiliation ? geoParseAffiliation(cleanAffiliation) : null;
  const authorState = await resolveState(admin, geoParsed?.city ?? null, geoParsed?.country ?? null);
  const parsed = {
    department: geoParsed?.department ?? null,
    hospital: geoParsed?.institution ?? null,
    city: geoParsed?.city ?? null,
    country: geoParsed?.country ?? null,
    state: authorState,
  };

  const { data: created } = await admin
    .from("authors")
    .insert({
      display_name: displayName || "Unknown",
      email,
      affiliations,
      openalex_id: openalexId,
      match_confidence: 0.8,
      ...parsed,
    })
    .select("id")
    .single();

  return { id: created!.id, outcome: "new" };
}

export type AuthorGeo = {
  department: string | null;
  institution: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  confidence: "high" | "low";
};

export async function linkAuthorsToArticle(
  admin: AdminClient,
  articleId: string,
  authors: Author[]
): Promise<{
  new: number;
  duplicates: number;
  rejected: number;
  firstAuthorGeo: AuthorGeo | null;
  lastAuthorGeo: AuthorGeo | null;
}> {
  let newCount = 0;
  let dupCount = 0;
  let rejectedCount = 0;
  let firstAuthorGeo: AuthorGeo | null = null;
  let lastAuthorGeo: AuthorGeo | null = null;

  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];

    // Reject authors with no name and no ORCID — cannot be resolved
    if (!author.lastName && !author.orcid) {
      // Still capture geo for position tracking
      const rejPrimaryAff = author.affiliations[0] ?? null;
      const geoParsed = rejPrimaryAff ? geoParseAffiliation(rejPrimaryAff) : null;
      if (i === 0 && geoParsed) firstAuthorGeo = { ...geoParsed, state: null };
      if (i === authors.length - 1 && authors.length > 1 && geoParsed) lastAuthorGeo = { ...geoParsed, state: null };
      rejectedCount++;
      continue;
    }

    const authorName = [author.foreName, author.lastName].filter(Boolean).join(" ");
    const tResolve = Date.now();
    const { id: authorId, outcome } = await resolveAuthorId(admin, author);
    console.log(`[import] resolveAuthorId "${authorName}": ${Date.now() - tResolve}ms`);

    // Capture geo data including state from the resolved author
    if (i === 0 || (i === authors.length - 1 && authors.length > 1)) {
      const linkPrimaryAff = author.affiliations[0] ?? null;
      const geoParsed = linkPrimaryAff ? geoParseAffiliation(linkPrimaryAff) : null;
      if (geoParsed) {
        // Fetch author's state from DB (set during resolveAuthorId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: authorRow } = await (admin as any)
          .from("authors")
          .select("state")
          .eq("id", authorId)
          .maybeSingle();
        const geoWithState: AuthorGeo = { ...geoParsed, state: (authorRow?.state as string | null) ?? null };
        if (i === 0) firstAuthorGeo = geoWithState;
        if (i === authors.length - 1 && authors.length > 1) lastAuthorGeo = geoWithState;
      }
    }

    const { error } = await admin.from("article_authors").insert({
      article_id: articleId,
      author_id: authorId,
      position: i + 1,
      is_corresponding: false,
      orcid_on_paper: author.orcid ? normalizeOrcid(author.orcid) : null,
    });

    if (error && error.code === "23505") {
      // Duplicate key — article already linked to this author
      dupCount++;
    } else if (error) {
      throw new Error(`article_authors insert: ${error.message}`);
    } else if (outcome === "new") {
      newCount++;
    } else {
      dupCount++;
    }
  }

  return { new: newCount, duplicates: dupCount, rejected: rejectedCount, firstAuthorGeo, lastAuthorGeo };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ArticleDetails {
  pubmedId: string;
  doi: string | null;
  pmcId: string | null;
  title: string;
  abstract: string | null;
  language: string | null;
  publicationTypes: string[];
  meshTerms: MeshTerm[];
  keywords: string[];
  coiStatement: string | null;
  grants: Grant[];
  substances: Substance[];
  journalAbbr: string | null;
  journalTitle: string | null;
  publishedYear: number | null;
  publishedDate: string | null;
  dateCompleted: string | null;
  volume: string | null;
  issue: string | null;
  authors: Author[];
  articleNumber: string | null;
  pubmedDate: string | null;
  pubmedIndexedAt: string | null;
  issnElectronic: string | null;
  issnPrint: string | null;
}

export interface ImportResult {
  logId: string | null;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Calls PubMed ESearch and returns a list of PMIDs for the given query.
 */
export async function fetchPubMedIds(
  queryString: string,
  maxResults = 100
): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: queryString,
    retmax: String(maxResults),
    retmode: "json",
    api_key: apiKey(),
  });

  const res = await fetch(`${BASE_URL}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`ESearch failed: HTTP ${res.status}`);

  const data = (await res.json()) as {
    esearchresult?: { idlist?: string[] };
  };

  return data.esearchresult?.idlist ?? [];
}

/**
 * Calls PubMed EFetch in batches of 20 and parses the XML response into
 * fully structured ArticleDetails objects.
 */
export async function fetchArticleDetails(
  pmids: string[]
): Promise<ArticleDetails[]> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) =>
      [
        "PubmedArticle",
        "Author",
        "AffiliationInfo",
        "Identifier",
        "ArticleId",
        "AbstractText",
        "MeshHeading",
        "QualifierName",
        "Grant",
        "Chemical",
        "Keyword",
        "PublicationType",
        "ELocationID",
        "ISSN",
        "PubMedPubDate",
      ].includes(name),
  });

  const results: ArticleDetails[] = [];

  for (let i = 0; i < pmids.length; i += BATCH_SIZE) {
    const batch = pmids.slice(i, i + BATCH_SIZE);

    const params = new URLSearchParams({
      db: "pubmed",
      id: batch.join(","),
      retmode: "xml",
      api_key: apiKey(),
    });

    const res = await fetch(`${BASE_URL}/efetch.fcgi?${params}`);
    if (!res.ok) throw new Error(`EFetch failed: HTTP ${res.status}`);

    const xml = await res.text();
    const parsed = parser.parse(xml) as {
      PubmedArticleSet?: { PubmedArticle?: Record<string, unknown>[] };
    };

    for (const article of parsed.PubmedArticleSet?.PubmedArticle ?? []) {
      const citation = article.MedlineCitation as Record<string, unknown> | undefined;
      const art = citation?.Article as Record<string, unknown> | undefined;

      const pubmedId = getText(citation?.PMID);
      if (!pubmedId) continue;

      // Title
      const title = decodeXmlEntities(getText(art?.ArticleTitle));

      // Abstract (may have multiple structured parts)
      const abstractParts = toArray(
        (art?.Abstract as Record<string, unknown> | undefined)?.AbstractText
      );
      const abstract =
        abstractParts.length > 0
          ? decodeXmlEntities(
              abstractParts
                .map((part) => {
                  const p = part as Record<string, unknown>;
                  const label = p["@_Label"] as string | undefined;
                  const text = getText(part);
                  return label ? `${label}: ${text}` : text;
                })
                .filter(Boolean)
                .join("\n\n")
            )
          : null;

      // Language
      const language = getText(art?.Language) || null;

      // Publication types
      const pubTypesRaw = toArray(
        (art?.PublicationTypeList as Record<string, unknown> | undefined)?.PublicationType
      );
      const publicationTypes = pubTypesRaw.map(getText).filter(Boolean);

      // Authors: [{ lastName, foreName, affiliation, orcid }]
      const authors = parseAuthors(art?.AuthorList);

      // Journal fields
      const journal = art?.Journal as Record<string, unknown> | undefined;
      const journalIssue = journal?.JournalIssue as Record<string, unknown> | undefined;
      const journalTitle = getText(journal?.Title) || null;
      const journalAbbr =
        getText(journal?.ISOAbbreviation) ||
        getText((citation?.MedlineJournalInfo as Record<string, unknown> | undefined)?.MedlineTA) ||
        null;
      const publishedYear = parsePubYear(journalIssue?.PubDate);
      const publishedDate = parsePubDateFull(journalIssue?.PubDate);
      const volume = getText(journalIssue?.Volume) || null;
      const issue = getText(journalIssue?.Issue) || null;

      // ISSN: electronic and print
      const issnArr = toArray(journal?.ISSN);
      const issnElectronic =
        getText(issnArr.find((s) => (s as Record<string, unknown>)["@_IssnType"] === "Electronic")) || null;
      const issnPrint =
        getText(issnArr.find((s) => (s as Record<string, unknown>)["@_IssnType"] === "Print")) || null;

      // Date completed
      const dateCompleted = parseDateCompleted(citation?.DateCompleted);

      // MeSH terms: [{ descriptor, qualifier }]
      const meshTerms = parseMeshTerms(citation?.MeshHeadingList);

      // Keywords
      const keywordsRaw = toArray(
        (citation?.KeywordList as Record<string, unknown> | undefined)?.Keyword
      );
      const keywords = keywordsRaw.map(getText).filter(Boolean);

      // Grants: [{ grantId, agency }]
      const grants = parseGrants(art?.GrantList);

      // Chemical substances: [{ registryNumber, name }]
      const substances = parseSubstances(citation?.ChemicalList);

      // COI statement
      const coiStatement = getText(art?.CoiStatement) || null;

      // ELocationID array (used for doi fallback)
      const elocations = toArray(art?.ELocationID as unknown);

      // Article IDs (DOI, PMC, PII)
      // ArticleIdList is an object with ArticleId array, not an array itself
      const articleIdList = (
        (article.PubmedData as Record<string, unknown> | undefined)
          ?.ArticleIdList as Record<string, unknown> | undefined
      )?.ArticleId;
      const idArr = toArray(articleIdList);

      const doiEntry = idArr.find(
        (id) => (id as Record<string, unknown>)["@_IdType"] === "doi"
      );
      const doiFromEloc = elocations.find(
        (e) => (e as Record<string, unknown>)["@_EIdType"] === "doi"
      );
      const doi =
        (doiEntry ? getText(doiEntry) : null) ||
        (doiFromEloc ? getText(doiFromEloc) : null) ||
        null;

      const pmcEntry = idArr.find(
        (id) => (id as Record<string, unknown>)["@_IdType"] === "pmc"
      );
      const pmcId = pmcEntry ? getText(pmcEntry) || null : null;

      // Article number: MedlinePgn (page range or article number, e.g. "233" or "123-145")
      const articleNumber =
        getText((art?.Pagination as Record<string, unknown> | undefined)?.MedlinePgn) || null;

      // PubMed date (date record was added to PubMed, often earlier than published_date)
      const historyObj = (article.PubmedData as Record<string, unknown> | undefined)
        ?.History as Record<string, unknown> | undefined;
      const pubMedDates = toArray(historyObj?.PubMedPubDate);
      const pubmedDateEntry = pubMedDates.find(
        (d) => (d as Record<string, unknown>)["@_PubStatus"] === "pubmed"
      );
      const pubmedDate = pubmedDateEntry
        ? parsePubDateFull(pubmedDateEntry)
        : null;

      const entrezDateEntry = pubMedDates.find(
        (d) => (d as Record<string, unknown>)["@_PubStatus"] === "entrez"
      );
      const pubmedIndexedAt = entrezDateEntry
        ? parsePubDateFull(entrezDateEntry)
        : null;

      results.push({
        pubmedId,
        doi,
        pmcId,
        title: title || `Article ${pubmedId}`,
        abstract,
        language,
        publicationTypes,
        meshTerms,
        keywords,
        coiStatement,
        grants,
        substances,
        journalAbbr,
        journalTitle,
        publishedYear,
        publishedDate,
        dateCompleted,
        volume,
        issue,
        authors,
        articleNumber,
        pubmedDate,
        pubmedIndexedAt,
        issnElectronic,
        issnPrint,
      });
    }

    if (i + BATCH_SIZE < pmids.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}

/**
 * Full import pipeline:
 *   1. Fetch active filters (or a specific one)
 *   2. ESearch → PMIDs
 *   3. Dedupe against existing articles (unless force=true)
 *   4. EFetch details
 *   5. Upsert — DB trigger merges specialty_tags on conflict
 *   6. Update import_logs
 */
export async function runImport(
  filterId?: string,
  force = false,
  existingLogId?: string,
  trigger: "cron" | "manual" = "cron"
): Promise<ImportResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let totalAuthorSlots = 0;

  // 1. Load filters — eksplicit circle != 2 så C2-filtre ikke kører som C1
  let q = admin.from("pubmed_filters").select("*").eq("active", true).neq("circle", 2);
  if (filterId) q = q.eq("id", filterId);

  const { data: filters, error: filtersErr } = await q;
  if (filtersErr) throw new Error(`Failed to fetch filters: ${filtersErr.message}`);

  if (!filters?.length) {
    return {
      logId: existingLogId ?? null,
      imported: 0,
      skipped: 0,
      errors: ["No active filters found"],
    };
  }

  // 2. Each filter gets its own log row
  const globalLogId = existingLogId ?? null;
  let logId = globalLogId; // track last used for return value

  for (const filter of filters) {
    // Guard: specialty must be a non-empty string — never insert without it
    if (!filter.specialty || String(filter.specialty).trim() === "") {
      const msg = `Filter "${filter.name}" (${filter.id}) has no specialty — skipping to avoid empty specialty_tags`;
      console.error(`[import] ${msg}`);
      errors.push(msg);
      continue;
    }
    const specialty = String(filter.specialty).trim();

    // Create per-filter log entry
    let filterLogId = globalLogId;
    if (!filterLogId) {
      const { data: filterLog } = await admin
        .from("import_logs")
        .insert({ filter_id: filter.id, status: "running", trigger })
        .select("id")
        .single();
      filterLogId = filterLog?.id ?? null;
      logId = filterLogId;
    }

    let filterImported = 0;
    let filterFetched = 0;
    let filterSkipped = 0;
    const filterErrors: string[] = [];

    try {
      await sleep(RATE_LIMIT_MS);

      // 3. ESearch
      const tSearch = Date.now();
      const pmids = await fetchPubMedIds(filter.query_string, filter.max_results ?? 100);
      console.log(`[import] fetchPubMedIds: ${Date.now() - tSearch}ms`);
      filterFetched = pmids.length;
      if (!pmids.length) continue;

      // 4. Deduplicate — chunk .in() to stay under PostgREST URL limit
      let newPmids = pmids;
      if (!force) {
        const DEDUP_CHUNK = 500;
        const existingSet = new Set<string>();
        for (let d = 0; d < pmids.length; d += DEDUP_CHUNK) {
          const chunk = pmids.slice(d, d + DEDUP_CHUNK);
          const { data: existing, error: dedupErr } = await admin
            .from("articles")
            .select("pubmed_id")
            .in("pubmed_id", chunk);
          if (dedupErr) throw new Error(`Dedup query failed: ${dedupErr.message}`);
          for (const r of existing ?? []) existingSet.add(r.pubmed_id);
        }
        newPmids = pmids.filter((id) => !existingSet.has(id));
        filterSkipped = pmids.length - newPmids.length;
      }

      // 5. Fetch & upsert in batches
      if (newPmids.length > 0) {
        const tFetch = Date.now();
        const articles = await fetchArticleDetails(newPmids);
        console.log(`[import] fetchArticleDetails (${articles.length} articles): ${Date.now() - tFetch}ms`);

        const tUpsert = Date.now();
        for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          const batch = articles.slice(i, i + BATCH_SIZE).map((a) => ({
            pubmed_id:         a.pubmedId,
            doi:               a.doi,
            pmc_id:            a.pmcId,
            title:             a.title,
            abstract:          a.abstract,
            language:          a.language,
            publication_types: a.publicationTypes,
            mesh_terms:        a.meshTerms as unknown as import("@/lib/supabase/types").Json,
            keywords:          a.keywords,
            coi_statement:     a.coiStatement,
            grants:            a.grants as unknown as import("@/lib/supabase/types").Json,
            substances:        a.substances as unknown as import("@/lib/supabase/types").Json,
            journal_abbr:      a.journalAbbr,
            journal_title:     a.journalTitle,
            published_year:    a.publishedYear,
            published_date:    a.publishedDate,
            date_completed:    a.dateCompleted,
            volume:            a.volume,
            issue:             a.issue,
            authors:           a.authors as unknown as import("@/lib/supabase/types").Json,
            article_number:    a.articleNumber,
            pubmed_date:       a.pubmedDate,
            pubmed_indexed_at: a.pubmedIndexedAt,
            issn_electronic:   a.issnElectronic,
            issn_print:        a.issnPrint,
            specialty_tags:    [specialty],
            circle:            1,
            approval_method:   "journal",
            status:            "approved",
          }));

          // Pre-insert validation: every row must have a non-empty specialty_tags
          const invalid = batch.filter(
            (row) => !row.specialty_tags || row.specialty_tags.length === 0 || !row.specialty_tags[0]
          );
          if (invalid.length > 0) {
            throw new Error(
              `${invalid.length} article(s) would be inserted with empty specialty_tags — aborting batch. PMIDs: ${invalid.map((r) => r.pubmed_id).join(", ")}`
            );
          }

          // ON CONFLICT (pubmed_id) DO NOTHING — never overwrite status/verified/specialty_tags
          const { data: upsertedRows, error: upsertErr } = await admin
            .from("articles")
            .upsert(batch, { onConflict: "pubmed_id", ignoreDuplicates: true })
            .select("id, pubmed_id");

          if (upsertErr) {
            errors.push(`Upsert batch error: ${upsertErr.message}`);
          } else {
            filterImported += batch.length;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const authors = (a.authors as unknown as unknown[]) ?? [];
              return sum + authors.length;
            }, 0);

            // Fire-and-forget — logArticleEvent catches its own errors
            void Promise.all(
              (upsertedRows ?? []).map((row) =>
                logArticleEvent(row.id, "imported", {
                  circle: 1,
                  status: "approved",
                  specialty_tags: [specialty],
                  pubmed_id: row.pubmed_id,
                  filter_name: filter.name,
                  import_log_id: filterLogId,
                })
              )
            );
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
        console.log(`[import] upsert batch: ${Date.now() - tUpsert}ms`);
      }

      await admin
        .from("pubmed_filters")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", filter.id);
    } catch (err) {
      const msg = `Filter "${filter.name}": ${err instanceof Error ? err.message : String(err)}`;
      filterErrors.push(msg);
      errors.push(msg);
    }

    // 6. Finalise log for this filter
    if (filterLogId) {
      const finalizePayload = {
        status: filterErrors.length > 0 && filterImported === 0 ? "failed" : "completed",
        articles_fetched: filterFetched,
        articles_imported: filterImported,
        articles_skipped: filterSkipped,
        author_slots_imported: totalAuthorSlots,
        errors: filterErrors.length > 0 ? filterErrors : null,
        completed_at: new Date().toISOString(),
      };
      console.log(`[import] finalizing log ${filterLogId}:`, JSON.stringify(finalizePayload));
      const { error: finalizeErr } = await admin
        .from("import_logs")
        .update(finalizePayload)
        .eq("id", filterLogId);
      if (finalizeErr) {
        console.error(`[import] Failed to finalize log ${filterLogId}:`, finalizeErr.message);
      }
    }

    totalFetched   += filterFetched;
    totalImported  += filterImported;
    totalSkipped   += filterSkipped;

    // 7. Quality checks
    if (filterLogId) {
      try {
        const qc = await runArticleChecks(filterLogId);
        if (!qc.passed) {
          console.warn(
            `[import] Article checks failed for filter "${filter.name}" (${filterLogId}): ` +
            `${qc.failedChecks}/${qc.totalChecks} checks failed — ` +
            qc.checks.filter(c => !c.passed).map(c => c.message).join("; ")
          );
        }
      } catch (qcErr) {
        console.warn(`[import] Article checks threw for ${filterLogId}:`, qcErr);
      }
    }
  }

  return { logId, imported: totalImported, skipped: totalSkipped, errors };
}
