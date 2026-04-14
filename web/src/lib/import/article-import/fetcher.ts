import { XMLParser } from "fast-xml-parser";

const BATCH_SIZE = 20;      // PubMed EFetch batch limit
const RATE_LIMIT_MS = 110;  // ~9 req/s — safely under PubMed's 10 req/s with API key
const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKey(): string {
  const key = process.env.PUBMED_API_KEY;
  if (!key) throw new Error("PUBMED_API_KEY is not configured");
  return key;
}

// ── XML helpers ────────────────────────────────────────────────────────────────

export function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export function getText(v: unknown): string {
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

function parsePubMedHistoryDate(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const d = node as Record<string, unknown>;
  const year = getText(d.Year);
  const month = getText(d.Month).padStart(2, "0");
  const day = getText(d.Day).padStart(2, "0");
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
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

// ── Author name normalization ──────────────────────────────────────────────────

export function normalizeAuthorName(name: string): string {
  return name.toLowerCase()
    .replace(/ø/g, 'oe').replace(/æ/g, 'ae').replace(/å/g, 'aa')
    .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue')
    .replace(/ñ/g, 'n').replace(/ç/g, 'c')
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
    .replace(/á/g, 'a').replace(/à/g, 'a').replace(/â/g, 'a')
    .replace(/í/g, 'i').replace(/ì/g, 'i').replace(/î/g, 'i')
    .replace(/ó/g, 'o').replace(/ò/g, 'o').replace(/ô/g, 'o')
    .replace(/ú/g, 'u').replace(/ù/g, 'u').replace(/û/g, 'u')
    .replace(/ß/g, 'ss').replace(/ð/g, 'd').replace(/þ/g, 'th')
    .replace(/ă/g, 'a').replace(/ș/g, 's').replace(/ț/g, 't')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Field parsers ──────────────────────────────────────────────────────────────

export interface Author {
  lastName: string;
  foreName: string;
  affiliations: string[];
  orcid: string | null;
}

export type AuthorOutcome = "new" | "duplicate" | "rejected";

export function parseAuthors(authorList: unknown): Author[] {
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

/**
 * Calls PubMed ESearch and returns a list of PMIDs for the given query.
 * If reldate is provided, restricts results to articles indexed within the last N days.
 */
export async function fetchPubMedIds(
  queryString: string,
  maxResults = 100,
  reldate?: number
): Promise<{ pmids: string[]; totalCount: number }> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: queryString,
    retmax: String(maxResults),
    retmode: "json",
    api_key: apiKey(),
  });

  if (reldate !== undefined) {
    params.set("datetype", "edat");
    params.set("reldate", String(reldate));
  }

  params.set("sort", "pub+date");

  const res = await fetch(`${BASE_URL}/esearch.fcgi`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error(`ESearch failed: HTTP ${res.status}`);

  const data = (await res.json()) as {
    esearchresult?: { idlist?: string[]; count?: string };
  };

  const pmids = data.esearchresult?.idlist ?? [];
  const totalCount = parseInt(data.esearchresult?.count ?? "0", 10);
  return { pmids, totalCount };
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

      // PubMed date
      const historyObj = (article.PubmedData as Record<string, unknown> | undefined)
        ?.History as Record<string, unknown> | undefined;
      const pubMedDates = toArray(historyObj?.PubMedPubDate);
      const pubmedDateEntry = pubMedDates.find(
        (d) => (d as Record<string, unknown>)["@_PubStatus"] === "pubmed"
      );
      const pubmedDate = pubmedDateEntry
        ? parsePubMedHistoryDate(pubmedDateEntry)
        : null;

      const entrezDateEntry = pubMedDates.find(
        (d) => (d as Record<string, unknown>)["@_PubStatus"] === "entrez"
      );
      const pubmedIndexedAt = entrezDateEntry
        ? parsePubMedHistoryDate(entrezDateEntry)
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
