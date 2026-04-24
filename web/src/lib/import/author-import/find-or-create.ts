import { createAdminClient } from "@/lib/supabase/admin";
import { extractEmail, stripEmailFromAffiliation } from "@/lib/geo/affiliation-utils";
import { parseAffiliation as geoParseAffiliation } from "@/lib/geo/affiliation-parser";
import { lookupCountry, getRegion, getContinent } from "@/lib/geo/country-map";
import { normalizeCountry } from "@/lib/geo/normalize";
import { normalizeGeo } from "@/lib/geo/normalize-geo";
import { logAuthorEvent } from "@/lib/author-events";
import { matchPubMedToOpenAlex } from "@/lib/openalex/match-authors";
import type { OpenAlexWork, OpenAlexAuthorship } from "@/lib/openalex/client";
import pLimit from "p-limit";
import { normalizeAuthorName, type Author, type AuthorOutcome } from "@/lib/import/article-import/fetcher";
import { fetchRorGeo, isGeoUpgrade } from "./geo-decision";
import { resolveState } from "./geo-writer";

type AdminClient = ReturnType<typeof createAdminClient>;


export type AuthorGeo = {
  department: string | null;
  institution: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  confidence: "high" | "low";
};

const OPENALEX_BASE = "https://api.openalex.org";
const OPENALEX_MAILTO = "digest@pulsefeed.dk";

export function normalizeOrcid(orcid: string): string {
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

function countryCodeToName(code: string): string | null {
  return lookupCountry(code.toLowerCase());
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
  debugName?: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (isGeoUpgrade(existing, parsed)) {
    if (parsed.country) update.country = parsed.country;
    if (parsed.city) update.city = normalizeGeo(parsed.city, parsed.country).city;
    if (parsed.institution) update.hospital = parsed.institution;
    if (parsed.department) update.department = parsed.department;
  }
  if (newOrcid && !existing.orcid) update.orcid = newOrcid;
  update.display_name_normalized = normalizeAuthorName(displayName);
  if (debugName) {
    console.log(`[GEO-DEBUG ${debugName}] mergeAuthor → authors.update id=${existingId} reason=${reason}`);
    console.log(`[GEO-DEBUG ${debugName}] mergeAuthor → existing: city=${existing.city} country=${existing.country}`);
    console.log(`[GEO-DEBUG ${debugName}] mergeAuthor → parsed: city=${parsed.city} country=${parsed.country} institution=${parsed.institution}`);
    console.log(`[GEO-DEBUG ${debugName}] mergeAuthor → isGeoUpgrade=${isGeoUpgrade(existing, parsed)}`);
    console.log(`[GEO-DEBUG ${debugName}] mergeAuthor → update object: ${JSON.stringify(update)}`);
  }
  await admin.from("authors").update(update).eq("id", existingId);
  void logAuthorEvent(existingId, "merged", {
    reason,
    merged_into_id: existingId,
    ...(articleId ? { article_id: articleId } : {}),
  });
}

export async function enrichAuthorWithOpenAlex(
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
  const countryName = primaryInst?.countryCode
    ? normalizeCountry(countryCodeToName(primaryInst.countryCode))
    : null;

  // 1. Match on existing openalex_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oaMatch } = await (admin as any)
    .from("authors")
    .select("id, display_name, orcid, openalex_id, city, geo_locked_by")
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
    if (
      !oaMatch.city &&
      primaryInst?.ror &&
      oaMatch.geo_locked_by !== "human" &&
      oaMatch.geo_locked_by !== "user"
    ) {
      const rorGeo = await fetchRorGeo(primaryInst.ror);
      if (rorGeo.city)    updates.city    = rorGeo.city;
      if (rorGeo.state)   updates.state   = rorGeo.state;
      if (rorGeo.country) updates.country = normalizeCountry(rorGeo.country);
      updates.ror_id     = primaryInst.ror;
      updates.geo_source = "ror";
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
          if (rorGeo.city)                      upgrades.city    = rorGeo.city;
          if (rorGeo.state)                     upgrades.state   = rorGeo.state;
          if (rorGeo.country && !countryName)   upgrades.country = normalizeCountry(rorGeo.country);
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
        if (rorGeo.city)                    upgrades.city  = rorGeo.city;
        if (rorGeo.state)                   upgrades.state = rorGeo.state;
        if (rorGeo.country && !countryName) upgrades.country = normalizeCountry(rorGeo.country);
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

  // 4. Fallback: run standard findOrCreateAuthor (handles name-based dedup, initial matching, etc.)
  const result = await findOrCreateAuthor(admin, pubmedAuthor, articleId);

  // Enrich the resolved author with OpenAlex metadata if it's missing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resolved } = await (admin as any)
    .from("authors")
    .select("openalex_id, ror_id, geo_source, department, city")
    .eq("id", result.id)
    .maybeSingle();

  if (resolved && (!resolved.openalex_id || (!resolved.city && primaryInst?.ror))) {
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
      if (rorGeo.city)    enrichment.city    = rorGeo.city;
      if (rorGeo.state)   enrichment.state   = rorGeo.state;
      if (rorGeo.country) enrichment.country = normalizeCountry(rorGeo.country);
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

export async function findOrCreateAuthor(
  admin: AdminClient,
  author: Author,
  articleId?: string | null,
  preResolvedOA?: OpenAlexIdResult | null,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  const displayName = [author.foreName, author.lastName].filter(Boolean).join(" ").trim();
  const normalized = normalizeAuthorName(displayName || "Unknown");
  const newOrcid = author.orcid ? normalizeOrcid(author.orcid) : null;

  const debugName = author.lastName === "Roohollahi" ? "Roohollahi" : undefined;

  const primaryAff = author.affiliations[0] ?? null;
  const affiliations = author.affiliations
    .map(a => stripEmailFromAffiliation(a))
    .filter((a): a is string => Boolean(a));
  const cleanAffiliation = affiliations[0] ?? null;
  const geoParsed = cleanAffiliation ? await geoParseAffiliation(cleanAffiliation) : null;
  const parsed = {
    city: geoParsed?.city
      ? normalizeGeo(geoParsed.city, geoParsed.country ?? null).city
      : null,
    country: normalizeCountry(geoParsed?.country) ?? null,
    institution: geoParsed?.institution ?? null,
    department: geoParsed?.department ?? null,
  };

  if (!parsed.country && parsed.city) {
    const enriched = normalizeGeo(parsed.city, null);
    if (enriched.country) parsed.country = enriched.country;
    if (enriched.city) parsed.city = enriched.city;
  }

  if (debugName) {
    console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: primaryAff="${primaryAff}"`);
    console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: parsed geo = ${JSON.stringify(parsed)}`);
  }

  // ── 1. ORCID exact match ───────────────────────────────────────────────────
  if (newOrcid) {
    const { data: orcidMatch } = await admin
      .from("authors")
      .select("id, city, country, hospital, department, orcid")
      .eq("orcid", newOrcid)
      .maybeSingle();

    if (orcidMatch) {
      if (debugName) console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: branch=1 (ORCID match) id=${orcidMatch.id}`);
      await mergeAuthor(admin, orcidMatch.id, orcidMatch, parsed, newOrcid, displayName, "orcid", articleId, debugName);
      return { id: orcidMatch.id, outcome: "duplicate" };
    }
  }

  // ── 1.5. OpenAlex lookup ──────────────────────────────────────────────────
  const openAlexResult = preResolvedOA ?? null;
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
  }

  // ── 2. Name-based matching ─────────────────────────────────────────────────
  const { data: candidates } = await admin
    .from("authors")
    .select("id, display_name, city, country, hospital, department, orcid")
    .eq("display_name_normalized", normalized)
    .limit(50);

  if (candidates && candidates.length > 0) {
    if (debugName) console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: branch=2 (name match) candidates=${candidates.length}`);
    if (newOrcid) {
      const orcidMatch = candidates.find(c => c.orcid === newOrcid);
      if (orcidMatch) {
        if (debugName) console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: branch=2a (ORCID in candidates) id=${orcidMatch.id}`);
        await mergeAuthor(admin, orcidMatch.id, orcidMatch, parsed, newOrcid, displayName, "orcid", articleId, debugName);
        return { id: orcidMatch.id, outcome: "duplicate" };
      }
      const withoutOrcidConflict = candidates.filter(c => !c.orcid);
      if (withoutOrcidConflict.length === 0) {
        if (debugName) console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: branch=2a (all ORCID conflict → create new)`);
        return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution, debugName);
      }
      return await matchByGeo(admin, withoutOrcidConflict, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution, debugName);
    }

    return await matchByGeo(admin, candidates, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution, debugName);
  }

  // ── 3. No candidates — create new author ───────────────────────────────────
  if (debugName) console.log(`[GEO-DEBUG ${debugName}] findOrCreateAuthor: branch=3 (no candidates → create new)`);
  return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution, debugName);
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
  debugName?: string,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  if (debugName) {
    console.log(`[GEO-DEBUG ${debugName}] matchByGeo: parsed city=${parsed.city} country=${parsed.country} candidates=${candidates.length}`);
  }

  // 2b. Same name + same city + same country
  if (parsed.city && parsed.country) {
    const geoMatch = candidates.find(
      c => c.city?.toLowerCase() === parsed.city!.toLowerCase()
        && c.country?.toLowerCase() === parsed.country!.toLowerCase()
    );
    if (geoMatch) {
      if (debugName) console.log(`[GEO-DEBUG ${debugName}] matchByGeo: branch=2b (same city+country) id=${geoMatch.id}`);
      await mergeAuthor(admin, geoMatch.id, geoMatch, parsed, newOrcid, displayName, "geo", articleId, debugName);
      return { id: geoMatch.id, outcome: "duplicate" };
    }
  }

  // 2e. No match — create new author
  if (debugName) console.log(`[GEO-DEBUG ${debugName}] matchByGeo: branch=2e (no match → create new)`);
  return await createNewAuthor(admin, displayName, normalized, newOrcid, primaryAff, affiliations, parsed, openAlexId, articleId, openAlexInstitution, debugName);
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
  debugName?: string,
): Promise<{ id: string; outcome: AuthorOutcome }> {
  const openalexId = resolvedOpenAlexId ?? null;
  const oaInst = (openalexId && resolvedOpenAlexInstitution) ? resolvedOpenAlexInstitution : null;

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

  // Determine geo: ROR is authoritative, parser fills gaps only
  let city: string | null = null;
  let country: string | null = null;
  let state: string | null = null;

  if (oaInst?.ror) {
    const rorGeo = await fetchRorGeo(oaInst.ror);
    if (rorGeo.city)    city    = rorGeo.city;
    if (rorGeo.state)   state   = rorGeo.state;
    if (rorGeo.country) country = rorGeo.country;
  }

  // Parser as fallback — only fills what ROR did not provide
  if (!city)    city    = parsed.city ? normalizeGeo(parsed.city, parsed.country).city : null;
  if (!country) country = parsed.country ?? null;

  if (!state) {
    state = await resolveState(admin, city, country);
  }

  const email = primaryAff ? extractEmail(primaryAff) : null;
  const matchConfidence = orcid ? 1.0 : 0.8;
  const geoSource = openalexId ? "openalex" : "parser";
  const verifiedBy = openalexId ? "openalex" : "uverificeret";

  if (debugName) {
    console.log(`[GEO-DEBUG ${debugName}] createNewAuthor → authors.insert display_name="${displayName}" city=${city} country=${country} state=${state} hospital=${hospital} geo_source=${geoSource}`);
  }

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

export async function linkAuthorsToArticle(
  admin: AdminClient,
  articleId: string,
  authors: Author[],
  oaWork?: OpenAlexWork | null,
): Promise<{
  new: number;
  duplicates: number;
  rejected: number;
}> {
  let newCount = 0;
  let dupCount = 0;
  let rejectedCount = 0;

  const oaMatchMap = oaWork
    ? matchPubMedToOpenAlex(
        authors.map(a => ({ lastName: a.lastName, firstName: a.foreName })),
        oaWork.authorships
      )
    : new Map<number, OpenAlexAuthorship>();

  const oaLimit = pLimit(10);
  const preResolvedOAMap = new Map<number, OpenAlexIdResult | null>();
  await Promise.all(
    authors.map((author, i) => {
      // Skip: already matched via DOI, no name, or no ORCID
      if (oaMatchMap.has(i) || (!author.lastName && !author.orcid)) return Promise.resolve();
      const orcid = author.orcid ? normalizeOrcid(author.orcid) : null;
      if (!orcid) {
        preResolvedOAMap.set(i, null);
        return Promise.resolve();
      }
      return oaLimit(async () => {
        // Check DB first — if ORCID already known, no API call needed
        const { data: existing } = await admin
          .from("authors")
          .select("id")
          .eq("orcid", orcid)
          .maybeSingle();
        if (existing) {
          preResolvedOAMap.set(i, null);
          return;
        }
        // ORCID not in DB — fetch from OpenAlex
        preResolvedOAMap.set(i, await fetchOpenAlexId(orcid, "", null));
      });
    })
  );

  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];

    if (!author.lastName && !author.orcid) {
      rejectedCount++;
      continue;
    }

    const authorName = [author.foreName, author.lastName].filter(Boolean).join(" ");
    const tResolve = Date.now();
    const oaAuthorship = oaMatchMap.get(i) ?? null;
    const { id: authorId, outcome } = oaAuthorship
      ? await enrichAuthorWithOpenAlex(admin, author, oaAuthorship, articleId, oaWork)
      : await findOrCreateAuthor(admin, author, articleId, preResolvedOAMap.get(i));
    console.error(`[import] resolve "${authorName}": ${Date.now() - tResolve}ms (${oaAuthorship ? "openalex" : "parser"})`);

    const { error } = await admin.from("article_authors").insert({
      article_id: articleId,
      author_id: authorId,
      position: i + 1,
      is_corresponding: oaAuthorship?.isCorresponding ?? false,
      orcid_on_paper: author.orcid ? normalizeOrcid(author.orcid) : null,
    });

    if (error && error.code === "23505") {
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

  if (oaWork) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("articles").update({
      openalex_work_id: oaWork.id,
      fwci: oaWork.fwci,
    }).eq("id", articleId);
  }

  return { new: newCount, duplicates: dupCount, rejected: rejectedCount };
}

// ── Article geo determination ─────────────────────────────────────────────────

export type ArticleGeoResult = {
  geo_city: string | null;
  geo_country: string | null;
  geo_state: string | null;
  geo_region: string | null;
  geo_continent: string | null;
  geo_institution: string | null;
  geo_department: string | null;
  geo_source: "ror" | "parser_openalex" | "parser_pubmed";
  parser_confidence: "high" | "low" | null;
};

/**
 * Determines article geo from the first author using authoritative sources:
 *   1. ROR institution lookup (if oaAuthorship has a ROR ID)
 *   2. OpenAlex raw affiliation string (parser fallback)
 *   3. PubMed affiliation string (parser fallback)
 * geo_region and geo_continent are derived deterministically from geo_country.
 */
export async function determineArticleGeo(
  admin: AdminClient,
  firstAuthor: Author,
  firstOaAuthorship: OpenAlexAuthorship | null,
): Promise<ArticleGeoResult> {
  const primaryInst = firstOaAuthorship?.institutions[0] ?? null;

  // ── 1. ROR-authoritative ──────────────────────────────────────────────────
  if (primaryInst?.ror) {
    const rorGeo = await fetchRorGeo(primaryInst.ror);
    if (rorGeo.city || rorGeo.country) {
      const country = rorGeo.country ?? null;
      const { hospital, department } = primaryInst.displayName
        ? splitInstitutionAndDepartment(primaryInst.displayName)
        : { hospital: null, department: null };
      return {
        geo_city:        rorGeo.city,
        geo_country:     country,
        geo_state:       rorGeo.state,
        geo_region:      country ? getRegion(country) : null,
        geo_continent:   country ? getContinent(country) : null,
        geo_institution: hospital,
        geo_department:  department,
        geo_source:      "ror",
        parser_confidence: null,
      };
    }
  }

  // ── 2. Parser fallback ────────────────────────────────────────────────────
  const oaRawAff = firstOaAuthorship?.rawAffiliationStrings[0] ?? null;
  const pubmedAff = firstAuthor.affiliations[0]
    ? stripEmailFromAffiliation(firstAuthor.affiliations[0])
    : null;

  const affString = oaRawAff ?? pubmedAff ?? null;
  const geoSource: "parser_openalex" | "parser_pubmed" = oaRawAff ? "parser_openalex" : "parser_pubmed";

  if (affString) {
    const parsed = await geoParseAffiliation(affString);
    if (parsed) {
      const rawCity = parsed.city ? normalizeGeo(parsed.city, parsed.country ?? null).city : null;
      const country = normalizeCountry(parsed.country) ?? null;
      const state = await resolveState(admin, rawCity, country);
      return {
        geo_city:          rawCity,
        geo_country:       country,
        geo_state:         state,
        geo_region:        country ? getRegion(country) : null,
        geo_continent:     country ? getContinent(country) : null,
        geo_institution:   parsed.institution ?? null,
        geo_department:    parsed.department ?? null,
        geo_source:        geoSource,
        parser_confidence: parsed.confidence,
      };
    }
  }

  // ── 3. Nothing parseable ──────────────────────────────────────────────────
  return {
    geo_city:          null,
    geo_country:       null,
    geo_state:         null,
    geo_region:        null,
    geo_continent:     null,
    geo_institution:   null,
    geo_department:    null,
    geo_source:        geoSource,
    parser_confidence: null,
  };
}
