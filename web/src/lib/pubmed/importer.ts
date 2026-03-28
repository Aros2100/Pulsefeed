import { XMLParser } from "fast-xml-parser";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEmail, stripEmailFromAffiliation } from "@/lib/geo/affiliation-utils";
import { parseAffiliation as geoParseAffiliation } from "@/lib/geo/affiliation-parser";
import { lookupCountry } from "@/lib/geo/country-map";
import { lookupState } from "@/lib/geo/state-map";
import { normalizeCity } from "@/lib/geo/normalize";
import { runArticleChecks } from "@/lib/pubmed/quality-checks";
import { logArticleEvent } from "@/lib/article-events";
import { buildImportEventPayload } from "@/lib/article-events/import-payload";
import type { OpenAlexWork, OpenAlexAuthorship } from "@/lib/openalex/client";
import { matchPubMedToOpenAlex } from "@/lib/openalex/match-authors";
import { logAuthorEvent } from "@/lib/author-events";
import pLimit from "p-limit";

type AdminClient = ReturnType<typeof createAdminClient>;

interface InitialCandidate {
  id: string;
  display_name: string;
  display_name_normalized: string | null;
  city: string | null;
  country: string | null;
  hospital: string | null;
  department: string | null;
  orcid: string | null;
}

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

const BATCH_SIZE = 20;      // PubMed EFetch batch limit
const RATE_LIMIT_MS = 110;  // ~9 req/s — safely under PubMed's 10 req/s with API key
const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Hent by/stat/land fra ROR geonames_details for et givet ROR-id (uden prefix)
async function fetchRorGeo(
  rorId: string
): Promise<{ city: string | null; state: string | null; country: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`https://api.ror.org/organizations/${rorId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { city: null, state: null, country: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const geo = data.locations?.[0]?.geonames_details;
    return {
      city:    geo?.name                     ?? null,
      state:   geo?.country_subdivision_name ?? null,
      country: geo?.country_name             ?? null,
    };
  } catch {
    clearTimeout(timeout);
    return { city: null, state: null, country: null };
  }
}

const DEPT_KEYWORDS = ["department", "division", "section", "unit", "laboratory", "lab "];

function isDepartment(name: string): boolean {
  const lower = name.toLowerCase();
  return DEPT_KEYWORDS.some(kw => lower.startsWith(kw));
}

function splitInstitutionAndDepartment(displayName: string): { hospital: string | null; department: string | null } {
  if (isDepartment(displayName)) {
    return { hospital: null, department: displayName };
  }
  return { hospital: displayName, department: null };
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

interface OpenAlexIdResult {
  id: string;
  institution: { displayName: string; ror: string | null; type: string } | null;
}

async function fetchOpenAlexId(
  orcid: string | null,
  name: string,
  affiliation: string | null
): Promise<OpenAlexIdResult | null> {
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
    const data = (await res.json()) as {
      results?: {
        id?: string;
        last_known_institutions?: { display_name?: string; ror?: string; type?: string }[];
      }[];
    };
    const first = data.results?.[0] ?? null;
    if (!first?.id) return null;
    const rawId = first.id.replace("https://openalex.org/", "");
    const rawInst = first.last_known_institutions?.[0] ?? null;
    const institution = rawInst ? {
      displayName: String(rawInst.display_name ?? ""),
      ror: rawInst.ror ? rawInst.ror.replace("https://ror.org/", "") : null,
      type: String(rawInst.type ?? ""),
    } : null;
    return { id: rawId, institution };
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

function isGeoUpgrade(
  existing: { city: string | null; country: string | null; hospital: string | null },
  parsed: { city: string | null; country: string | null; institution: string | null },
): boolean {
  if (!existing.country && parsed.country) return true;
  if (!existing.city && parsed.city) return true;
  if (existing.city && parsed.city) {
    const INST_WORDS = ["university", "hospital", "institute", "college", "school",
      "center", "centre", "clinic", "department", "faculty"];
    const oldHasInst = INST_WORDS.some(w => existing.city!.toLowerCase().includes(w));
    const newHasInst = INST_WORDS.some(w => parsed.city!.toLowerCase().includes(w));
    if (oldHasInst && !newHasInst) return true;
  }
  return false;
}

async function mergeAuthor(
  admin: AdminClient,
  existingId: string,
  existing: { city: string | null; country: string | null; hospital: string | null; department: string | null; orcid: string | null },
  parsed: { city: string | null; country: string | null; institution: string | null; department: string | null },
  newOrcid: string | null,
  displayName: string,
  reason: "orcid" | "geo" = "geo",
  articleId?: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (isGeoUpgrade(existing, parsed)) {
    if (parsed.country) update.country = parsed.country;
    if (parsed.city) update.city = normalizeCity(parsed.city);
    if (parsed.institution) update.hospital = parsed.institution;
    if (parsed.department) update.department = parsed.department;
  }
  if (newOrcid && !existing.orcid) update.orcid = newOrcid;
  update.display_name_normalized = normalizeAuthorName(displayName);
  await admin.from("authors").update(update).eq("id", existingId);
  void logAuthorEvent(existingId, "merged", {
    reason,
    merged_into_id: existingId,
    ...(articleId ? { article_id: articleId } : {}),
  });
}

function countryCodeToName(code: string): string | null {
  return lookupCountry(code.toLowerCase());
}

async function resolveAuthorFromOpenAlex(
  admin: AdminClient,
  pubmedAuthor: Author,
  oaAuthorship: OpenAlexAuthorship,
  articleId?: string | null,
  oaWork?: OpenAlexWork | null,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  const oaId = oaAuthorship.author.id;
  const oaOrcid = oaAuthorship.author.orcid;
  const displayName = oaAuthorship.author.displayName ||
    [pubmedAuthor.foreName, pubmedAuthor.lastName].filter(Boolean).join(" ").trim();
  const normalized = normalizeAuthorName(displayName || "Unknown");
  const primaryInst = oaAuthorship.institutions[0] ?? null;
  const countryName = primaryInst?.countryCode ? countryCodeToName(primaryInst.countryCode) : null;

  // 1. Match on existing openalex_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oaMatch } = await (admin as any)
    .from("authors")
    .select("id, display_name, orcid, openalex_id")
    .eq("openalex_id", oaId)
    .maybeSingle();

  if (oaMatch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (!oaMatch.orcid && oaOrcid) updates.orcid = oaOrcid;
    if (displayName.length > (oaMatch.display_name?.length ?? 0)) {
      updates.display_name = displayName;
      updates.display_name_normalized = normalized;
    }
    if (Object.keys(updates).length > 0) {
      await admin.from("authors").update(updates).eq("id", oaMatch.id);
    }
    return { id: oaMatch.id, outcome: "duplicate" };
  }

  // 2. Match on ORCID (author exists but missing openalex_id)
  const newOrcid = oaOrcid || (pubmedAuthor.orcid ? normalizeOrcid(pubmedAuthor.orcid) : null);
  if (newOrcid) {
    const { data: orcidMatch } = await admin
      .from("authors")
      .select("id")
      .eq("orcid", newOrcid)
      .maybeSingle();

    if (orcidMatch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upgrades: Record<string, any> = { openalex_id: oaId, geo_source: "openalex", verified_by: "openalex", openalex_enriched_at: new Date().toISOString() };
      if (countryName) upgrades.country = countryName;
      if (primaryInst) {
        const { hospital, department } = splitInstitutionAndDepartment(primaryInst.displayName);
        if (hospital)    upgrades.hospital    = hospital;
        if (department)  upgrades.department  = department;
        upgrades.ror_id = primaryInst.ror;
        upgrades.institution_type = primaryInst.type;
        if (primaryInst.ror) {
          const rorGeo = await fetchRorGeo(primaryInst.ror);
          if (rorGeo.city)                      upgrades.city    = normalizeCity(rorGeo.city);
          if (rorGeo.state)                     upgrades.state   = rorGeo.state;
          if (rorGeo.country && !countryName)   upgrades.country = rorGeo.country;
        }
      }
      await admin.from("authors").update(upgrades).eq("id", orcidMatch.id);
      void logAuthorEvent(orcidMatch.id, "openalex_enriched", {
        openalex_id: oaId,
        ror_id: primaryInst?.ror ?? null,
        institution_type: primaryInst?.type ?? null,
        geo_source: "openalex",
        verified_by: "openalex",
      });
      return { id: orcidMatch.id, outcome: "duplicate" };
    }
  }

  // 3. Match on normalized name + same country (migrate from parser to OA)
  if (countryName) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nameMatch } = await (admin as any)
      .from("authors")
      .select("id, openalex_id, orcid")
      .eq("display_name_normalized", normalized)
      .eq("country", countryName)
      .is("openalex_id", null)
      .limit(1)
      .maybeSingle();

    if (nameMatch && !(newOrcid && nameMatch.orcid && newOrcid !== nameMatch.orcid)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { hospital: instHospital, department: instDept } = primaryInst?.displayName
        ? splitInstitutionAndDepartment(primaryInst.displayName)
        : { hospital: null, department: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upgrades: Record<string, any> = {
        openalex_id: oaId,
        orcid: newOrcid || nameMatch.orcid,
        hospital: instHospital ?? null,
        ror_id: primaryInst?.ror ?? null,
        institution_type: primaryInst?.type ?? null,
        country: countryName,
        geo_source: "openalex",
        verified_by: "openalex",
        openalex_enriched_at: new Date().toISOString(),
        display_name: displayName,
        display_name_normalized: normalized,
      };
      if (instDept) upgrades.department = instDept;
      if (primaryInst?.ror) {
        const rorGeo = await fetchRorGeo(primaryInst.ror);
        if (rorGeo.city)                    upgrades.city  = normalizeCity(rorGeo.city);
        if (rorGeo.state)                   upgrades.state = rorGeo.state;
        if (rorGeo.country && !countryName) upgrades.country = rorGeo.country;
      }
      await admin.from("authors").update(upgrades).eq("id", nameMatch.id);
      void logAuthorEvent(nameMatch.id, "openalex_enriched", {
        openalex_id: oaId,
        ror_id: primaryInst?.ror ?? null,
        institution_type: primaryInst?.type ?? null,
        geo_source: "openalex",
        verified_by: "openalex",
      });
      return { id: nameMatch.id, outcome: "duplicate" };
    }
  }

  // 4. Fallback: run standard resolveAuthorId (handles name-based dedup, initial matching, etc.)
  // But enrich the result with OpenAlex data afterwards
  const result = await resolveAuthorId(admin, pubmedAuthor, articleId);

  // Enrich the resolved author with OpenAlex metadata if it's missing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resolved } = await (admin as any)
    .from("authors")
    .select("openalex_id, ror_id, geo_source, department")
    .eq("id", result.id)
    .maybeSingle();

  if (resolved && !resolved.openalex_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichment: Record<string, any> = { openalex_id: oaId, openalex_enriched_at: new Date().toISOString() };
    if (primaryInst?.displayName) {
      const { hospital, department } = splitInstitutionAndDepartment(primaryInst.displayName);
      if (hospital)                          enrichment.hospital    = hospital;
      if (department && !resolved.department) enrichment.department = department;
    }
    if (primaryInst?.ror && !resolved.ror_id) {
      enrichment.ror_id = primaryInst.ror;
      const rorGeo = await fetchRorGeo(primaryInst.ror);
      if (rorGeo.city)    enrichment.city    = normalizeCity(rorGeo.city);
      if (rorGeo.state)   enrichment.state   = rorGeo.state;
      if (rorGeo.country) enrichment.country = rorGeo.country;
    }
    if (primaryInst?.type) enrichment.institution_type = primaryInst.type;
    if (resolved.geo_source !== "manual") enrichment.geo_source = "openalex";
    enrichment.verified_by = "openalex";
    await admin.from("authors").update(enrichment).eq("id", result.id);
    void logAuthorEvent(result.id, "openalex_enriched", {
      openalex_id: oaId,
      ror_id: enrichment.ror_id ?? null,
      institution_type: enrichment.institution_type ?? null,
      geo_source: "openalex",
      verified_by: "openalex",
    });
    void logAuthorEvent(result.id, "openalex_fetched", {
      openalex_id: oaId,
      ror_id: primaryInst?.ror ?? null,
      institution_type: primaryInst?.type ?? null,
      fwci: oaWork?.fwci ?? null,
    });
  }

  return result;
}

async function resolveAuthorId(
  admin: AdminClient,
  author: Author,
  articleId?: string | null,
  preResolvedOA?: OpenAlexIdResult | null,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  const displayName = [author.foreName, author.lastName].filter(Boolean).join(" ").trim();
  const normalized = normalizeAuthorName(displayName || "Unknown");
  const newOrcid = author.orcid ? normalizeOrcid(author.orcid) : null;

  // Parse affiliations upfront
  const primaryAff = author.affiliations[0] ?? null;
  const affiliations = author.affiliations
    .map(a => stripEmailFromAffiliation(a))
    .filter((a): a is string => Boolean(a));
  const cleanAffiliation = affiliations[0] ?? null;
  const geoParsed = cleanAffiliation ? await geoParseAffiliation(cleanAffiliation) : null;
  const parsed = {
    city: geoParsed?.city ?? null,
    country: geoParsed?.country ?? null,
    institution: geoParsed?.institution ?? null,
    department: geoParsed?.department ?? null,
  };

  // ── 1. ORCID exact match ───────────────────────────────────────────────────
  if (newOrcid) {
    const { data: orcidMatch } = await admin
      .from("authors")
      .select("id, city, country, hospital, department, orcid")
      .eq("orcid", newOrcid)
      .maybeSingle();

    if (orcidMatch) {
      await mergeAuthor(admin, orcidMatch.id, orcidMatch, parsed, newOrcid, displayName, "orcid", articleId);
      return { id: orcidMatch.id, outcome: "duplicate" };
    }
  }

  // ── 1.5. OpenAlex lookup ──────────────────────────────────────────────────
  const openAlexResult = preResolvedOA !== undefined
    ? preResolvedOA
    : await fetchOpenAlexId(newOrcid, normalized, parsed.institution);
  const openAlexId = openAlexResult?.id ?? null;
  const openAlexInstitution = openAlexResult?.institution ?? null;
  if (openAlexId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: oaMatch } = await (admin as any)
      .from("authors")
      .select("id, orcid, display_name")
      .eq("openalex_id", openAlexId)
      .maybeSingle();

    if (oaMatch) {
      // Existing record found via OpenAlex — merge and return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      if (!oaMatch.orcid && newOrcid) updates.orcid = newOrcid;
      if (displayName.length > (oaMatch.display_name?.length ?? 0)) {
        updates.display_name = displayName;
        updates.display_name_normalized = normalized;
      }
      if (Object.keys(updates).length > 0) {
        await admin.from("authors").update(updates).eq("id", oaMatch.id);
      }
      return { id: oaMatch.id, outcome: "duplicate" };
    }
    // No existing record — fall through to name matching, carry openAlexId forward
  }

  // ── 2. Name-based matching ─────────────────────────────────────────────────
  const { data: candidates } = await admin
    .from("authors")
    .select("id, display_name, city, country, hospital, department, orcid")
    .eq("display_name_normalized", normalized)
    .limit(50);

  if (candidates && candidates.length > 0) {
    // 2a. ORCID conflict check — never merge if both have different ORCIDs
    //     Also find ORCID match among name candidates
    if (newOrcid) {
      const orcidMatch = candidates.find(c => c.orcid === newOrcid);
      if (orcidMatch) {
        await mergeAuthor(admin, orcidMatch.id, orcidMatch, parsed, newOrcid, displayName, "orcid", articleId);
        return { id: orcidMatch.id, outcome: "duplicate" };
      }
      // All candidates with a different ORCID → skip them, create new
      const withoutOrcidConflict = candidates.filter(c => !c.orcid);
      if (withoutOrcidConflict.length === 0) {
        // Every candidate has a different ORCID — create new author
        return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution);
      }
      // Continue matching only against candidates without ORCID
      return await matchByGeo(admin, withoutOrcidConflict, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution);
    }

    // No ORCID on new author — filter out candidates where ORCID conflict is impossible
    return await matchByGeo(admin, candidates, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution);
  }

  // ── 2.5. Initial-match: "J Sørensen" → "Jens Sørensen" ─────────────────────
  // If the new author's first name part is short (1-2 chars, likely initials),
  // look for existing authors with same last name + same city + same country
  // whose first name starts with the same letter(s).
  const firstPart = normalized.split(' ')[0] ?? '';
  if (firstPart.length <= 2 && parsed.city && parsed.country) {
    const lastNameNorm = normalized
      .replace(/\b(von|van|de|del|della|di|du|le|la|el|al|bin|ibn)\b/g, '')
      .trim()
      .split(/\s+/)
      .pop() ?? '';

    if (lastNameNorm.length > 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;
      const { data: initialCandidates } = await db
        .from('authors')
        .select('id, display_name, display_name_normalized, city, country, hospital, department, orcid')
        .eq('city', parsed.city)
        .eq('country', parsed.country)
        .neq('display_name_normalized', normalized)
        .limit(50) as { data: InitialCandidate[] | null };

      if (initialCandidates && initialCandidates.length > 0) {
        const matches = initialCandidates.filter(c => {
          const cNorm = c.display_name_normalized ?? '';
          const cLastName = cNorm
            .replace(/\b(von|van|de|del|della|di|du|le|la|el|al|bin|ibn)\b/g, '')
            .trim()
            .split(/\s+/)
            .pop() ?? '';
          const cFirstPart = cNorm.split(' ')[0] ?? '';
          return cLastName === lastNameNorm
            && cFirstPart.length > 2
            && cFirstPart.startsWith(firstPart);
        });

        if (matches.length === 1) {
          const match = matches[0];
          if (!(newOrcid && match.orcid && newOrcid !== match.orcid)) {
            await mergeAuthor(admin, match.id, match, parsed, newOrcid, displayName, "geo", articleId);
            return { id: match.id, outcome: 'duplicate' };
          }
        }
      }
    }
  }

  // Also check the reverse: new author has full name, existing has initials
  if (firstPart.length > 2 && parsed.city && parsed.country) {
    const lastNameNorm = normalized
      .replace(/\b(von|van|de|del|della|di|du|le|la|el|al|bin|ibn)\b/g, '')
      .trim()
      .split(/\s+/)
      .pop() ?? '';

    if (lastNameNorm.length > 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;
      const { data: reverseCandidates } = await db
        .from('authors')
        .select('id, display_name, display_name_normalized, city, country, hospital, department, orcid')
        .eq('city', parsed.city)
        .eq('country', parsed.country)
        .neq('display_name_normalized', normalized)
        .limit(50) as { data: InitialCandidate[] | null };

      if (reverseCandidates && reverseCandidates.length > 0) {
        const matches = reverseCandidates.filter(c => {
          const cNorm = c.display_name_normalized ?? '';
          const cLastName = cNorm
            .replace(/\b(von|van|de|del|della|di|du|le|la|el|al|bin|ibn)\b/g, '')
            .trim()
            .split(/\s+/)
            .pop() ?? '';
          const cFirstPart = cNorm.split(' ')[0] ?? '';
          return cLastName === lastNameNorm
            && cFirstPart.length <= 2
            && firstPart.startsWith(cFirstPart);
        });

        if (matches.length === 1) {
          const match = matches[0];
          if (!(newOrcid && match.orcid && newOrcid !== match.orcid)) {
            await mergeAuthor(admin, match.id, match, parsed, newOrcid, displayName, "geo", articleId);
            if (displayName.length > (match.display_name?.length ?? 0)) {
              await db.from('authors').update({
                display_name: displayName,
                display_name_normalized: normalized,
              }).eq('id', match.id);
            }
            return { id: match.id, outcome: 'duplicate' };
          }
        }
      }
    }
  }

  // ── 3. No candidates — create new author ───────────────────────────────────
  return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution);
}

async function matchByGeo(
  admin: AdminClient,
  candidates: { id: string; display_name: string; city: string | null; country: string | null; hospital: string | null; department: string | null; orcid: string | null }[],
  displayName: string,
  normalized: string,
  newOrcid: string | null,
  primaryAff: string | null,
  affiliations: string[],
  parsed: { city: string | null; country: string | null; institution: string | null; department: string | null },
  openAlexId: string | null,
  articleId?: string | null,
  openAlexInstitution?: { displayName: string; ror: string | null; type: string } | null,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  // 2b. Same name + same city + same country
  if (parsed.city && parsed.country) {
    const geoMatch = candidates.find(
      c => c.city?.toLowerCase() === parsed.city!.toLowerCase()
        && c.country?.toLowerCase() === parsed.country!.toLowerCase()
    );
    if (geoMatch) {
      await mergeAuthor(admin, geoMatch.id, geoMatch, parsed, newOrcid, displayName, "geo", articleId);
      return { id: geoMatch.id, outcome: "duplicate" };
    }
  }

  // 2b2. Same name + same city + same country, different hospital
  // Only merge if exactly 1 candidate in that city — avoids false positives
  // with common names (e.g. 53 different "Zhang" in Beijing)
  if (parsed.city && parsed.country) {
    const sameCityCountry = candidates.filter(
      c => c.city?.toLowerCase() === parsed.city!.toLowerCase()
        && c.country?.toLowerCase() === parsed.country!.toLowerCase()
    );
    if (sameCityCountry.length === 1) {
      const match = sameCityCountry[0];
      if (!(newOrcid && match.orcid && newOrcid !== match.orcid)) {
        await mergeAuthor(admin, match.id, match, parsed, newOrcid, displayName, "geo", articleId);
        return { id: match.id, outcome: "duplicate" };
      }
    }
  }

  // 2c. Same name + existing has no geo
  const noGeoMatch = candidates.find(c => !c.city && !c.country);
  if (noGeoMatch) {
    await mergeAuthor(admin, noGeoMatch.id, noGeoMatch, parsed, newOrcid, displayName, "geo", articleId);
    return { id: noGeoMatch.id, outcome: "duplicate" };
  }

  // 2d. Same name + new has no geo, existing has geo → merge into existing
  if (!parsed.city && !parsed.country) {
    const firstWithGeo = candidates.find(c => c.city || c.country);
    if (firstWithGeo) {
      await mergeAuthor(admin, firstWithGeo.id, firstWithGeo, parsed, newOrcid, displayName, "geo", articleId);
      return { id: firstWithGeo.id, outcome: "duplicate" };
    }
  }

  // 2e. No match — create new author
  return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution);
}

async function createNewAuthor(
  admin: AdminClient,
  displayName: string,
  normalized: string,
  orcid: string | null,
  primaryAff: string | null,
  affiliations: string[],
  parsed: { city: string | null; country: string | null; institution: string | null; department: string | null },
  resolvedOpenAlexId?: string | null,
  articleId?: string | null,
  resolvedOpenAlexInstitution?: { displayName: string; ror: string | null; type: string } | null,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  await sleep(150);
  const openalexId = resolvedOpenAlexId ?? null;
  const oaInst = (openalexId && resolvedOpenAlexInstitution) ? resolvedOpenAlexInstitution : null;

  // Determine institution fields: prefer OA over parser
  let hospital = parsed.institution;
  let department = parsed.department;
  let institutionType: string | null = null;
  let rorId: string | null = null;
  if (oaInst) {
    const split = splitInstitutionAndDepartment(oaInst.displayName);
    if (split.hospital) hospital = split.hospital;
    if (split.department) department = split.department;
    institutionType = oaInst.type || null;
    rorId = oaInst.ror ?? null;
  }

  // Determine geo: ROR geo as primary, fall back to parser
  let city = normalizeCity(parsed.city);
  let country = parsed.country;
  let state: string | null = null;
  if (oaInst?.ror) {
    const rorGeo = await fetchRorGeo(oaInst.ror);
    if (rorGeo.city)    city    = normalizeCity(rorGeo.city);
    if (rorGeo.state)   state   = rorGeo.state;
    if (rorGeo.country) country = rorGeo.country;
  }
  if (!state) {
    state = await resolveState(admin, city, country);
  }

  const email = primaryAff ? extractEmail(primaryAff) : null;
  const matchConfidence = orcid ? 1.0 : 0.8;
  const geoSource = openalexId ? "openalex" : "parser";
  const verifiedBy = openalexId ? "openalex" : "uverificeret";

  const { data: created } = await admin
    .from("authors")
    .insert({
      display_name: displayName || "Unknown",
      display_name_normalized: normalized,
      orcid,
      openalex_id: openalexId,
      openalex_enriched_at: openalexId ? new Date().toISOString() : null,
      geo_source: geoSource,
      verified_by: verifiedBy,
      email,
      affiliations,
      match_confidence: matchConfidence,
      department,
      hospital,
      ror_id: rorId,
      institution_type: institutionType,
      city,
      country,
      state,
    })
    .select("id")
    .single();

  void logAuthorEvent(created!.id, "created", {
    source: openalexId ? "openalex" : "parser",
    verified_by: verifiedBy,
    match_confidence: matchConfidence,
    geo_source: geoSource,
    ...(articleId ? { article_id: articleId } : {}),
  });

  if (parsed.country || parsed.city) {
    void logAuthorEvent(created!.id, "geo_parsed", {
      country: parsed.country ?? null,
      city: parsed.city ?? null,
      institution: parsed.institution ?? null,
      source: "parser",
      confidence: null,
    });
  }

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
  authors: Author[],
  oaWork?: OpenAlexWork | null,
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

  // Match PubMed authors → OpenAlex authorships
  const oaMatchMap = oaWork
    ? matchPubMedToOpenAlex(
        authors.map(a => ({ lastName: a.lastName, firstName: a.foreName })),
        oaWork.authorships
      )
    : new Map<number, OpenAlexAuthorship>();

  // Pre-fetch OpenAlex IDs in parallel for authors not matched via OA work
  const oaLimit = pLimit(5);
  const preResolvedOAMap = new Map<number, OpenAlexIdResult | null>();
  await Promise.all(
    authors.map((author, i) => {
      if (oaMatchMap.has(i) || (!author.lastName && !author.orcid)) return Promise.resolve();
      return oaLimit(async () => {
        const orcid = author.orcid ? normalizeOrcid(author.orcid) : null;
        const name = normalizeAuthorName([author.foreName, author.lastName].filter(Boolean).join(" ").trim());
        const primaryAff = author.affiliations[0] ?? null;
        const geoParsed = primaryAff ? await geoParseAffiliation(primaryAff) : null;
        preResolvedOAMap.set(i, await fetchOpenAlexId(orcid, name, geoParsed?.institution ?? null));
      });
    })
  );

  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];

    // Reject authors with no name and no ORCID — cannot be resolved
    if (!author.lastName && !author.orcid) {
      // Still capture geo for position tracking
      const rejPrimaryAff = author.affiliations[0] ?? null;
      const geoParsed = rejPrimaryAff ? await geoParseAffiliation(rejPrimaryAff) : null;
      if (i === 0 && geoParsed) firstAuthorGeo = { ...geoParsed, state: null };
      if (i === authors.length - 1 && authors.length > 1 && geoParsed) lastAuthorGeo = { ...geoParsed, state: null };
      rejectedCount++;
      continue;
    }

    const authorName = [author.foreName, author.lastName].filter(Boolean).join(" ");
    const tResolve = Date.now();
    const oaAuthorship = oaMatchMap.get(i) ?? null;
    const { id: authorId, outcome } = oaAuthorship
      ? await resolveAuthorFromOpenAlex(admin, author, oaAuthorship, articleId, oaWork)
      : await resolveAuthorId(admin, author, articleId, preResolvedOAMap.get(i));
    console.error(`[import] resolve "${authorName}": ${Date.now() - tResolve}ms (${oaAuthorship ? "openalex" : "parser"})`);

    // Capture geo data for article from parser — always, regardless of OpenAlex match
    if (i === 0 || (i === authors.length - 1 && authors.length > 1)) {
      const linkPrimaryAff = author.affiliations[0] ?? null;
      const geoParsed = linkPrimaryAff ? await geoParseAffiliation(linkPrimaryAff) : null;

      let geoForArticle: AuthorGeo | null = null;
      if (geoParsed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: authorRow } = await (admin as any)
          .from("authors")
          .select("state")
          .eq("id", authorId)
          .maybeSingle();
        geoForArticle = { ...geoParsed, state: (authorRow?.state as string | null) ?? null };
      }

      if (geoForArticle) {
        if (i === 0) firstAuthorGeo = geoForArticle;
        if (i === authors.length - 1 && authors.length > 1) lastAuthorGeo = geoForArticle;
      }
    }

    const { error } = await admin.from("article_authors").insert({
      article_id: articleId,
      author_id: authorId,
      position: i + 1,
      is_corresponding: oaAuthorship?.isCorresponding ?? false,
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
      void logAuthorEvent(authorId, "article_linked", {
        article_id: articleId,
      });
    }
  }

  // Save OpenAlex work metadata on article
  if (oaWork) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("articles").update({
      openalex_work_id: oaWork.id,
      fwci: oaWork.fwci,
    }).eq("id", articleId);
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
      console.error(`[import] fetchPubMedIds: ${Date.now() - tSearch}ms`);
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
        console.error(`[import] fetchArticleDetails (${articles.length} articles): ${Date.now() - tFetch}ms`);

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
            filterImported += (upsertedRows ?? []).length;
            totalAuthorSlots += batch.reduce((sum, a) => {
              const authors = (a.authors as unknown as unknown[]) ?? [];
              return sum + authors.length;
            }, 0);

            // Fire-and-forget — logArticleEvent catches its own errors
            void Promise.all(
              (upsertedRows ?? []).map((row) =>
                logArticleEvent(row.id, "imported", buildImportEventPayload({
                  circle: 1,
                  status: "approved",
                  approval_method: "journal",
                  specialty_tags: [specialty],
                  pubmed_id: row.pubmed_id,
                  import_log_id: filterLogId,
                  source_id: null,
                }))
              )
            );
          }

          if (i + BATCH_SIZE < articles.length) await sleep(RATE_LIMIT_MS);
        }
        console.error(`[import] upsert batch: ${Date.now() - tUpsert}ms`);
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
      console.error(`[import] finalizing log ${filterLogId}:`, JSON.stringify(finalizePayload));
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
