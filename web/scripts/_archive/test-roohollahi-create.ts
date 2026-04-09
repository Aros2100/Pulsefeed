/**
 * Simulerer præcis hvad createNewAuthor ville have skrevet da forfatter
 * b08bc8dd-70ab-4691-9e58-27ffafacd2f1 (Faramarz Roohollahi) blev oprettet.
 *
 * Kør med:
 *   npx --yes dotenv-cli -e .env.local -- npx tsx test-roohollahi-create.ts
 */
import { createAdminClient } from './src/lib/supabase/admin';
import { parseAffiliation } from './src/lib/geo/affiliation-parser';
import { resolveCityAlias } from './src/lib/geo/city-aliases';

const AUTHOR_ID  = 'b08bc8dd-70ab-4691-9e58-27ffafacd2f1';
const ARTICLE_ID = '53ee462a-4e52-40ff-86d4-ac4e0cc7a189';
const D          = 'b08bc8dd';

async function fetchRorGeo(
  rorId: string,
): Promise<{ city: string | null; state: string | null; country: string | null; raw: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`https://api.ror.org/organizations/${rorId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { city: null, state: null, country: null, raw: { status: res.status } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const geo = data.locations?.[0]?.geonames_details;
    return {
      city:    geo?.name                     ?? null,
      state:   geo?.country_subdivision_name ?? null,
      country: geo?.country_name             ?? null,
      raw:     { locations: data.locations, name: data.name },
    };
  } catch (e) {
    clearTimeout(timeout);
    return { city: null, state: null, country: null, raw: { error: String(e) } };
  }
}

async function fetchOpenAlexAuthor(openalexId: string): Promise<{
  displayName: string | null;
  institution: { displayName: string; ror: string | null; type: string } | null;
} | null> {
  try {
    const url = `https://api.openalex.org/authors/${openalexId}?mailto=digest@pulsefeed.dk`;
    const res = await fetch(url, { headers: { 'User-Agent': 'pulsefeed/1.0 (mailto:digest@pulsefeed.dk)' } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const rawInst = data.last_known_institutions?.[0] ?? null;
    return {
      displayName: data.display_name ?? null,
      institution: rawInst ? {
        displayName: String(rawInst.display_name ?? ''),
        ror: rawInst.ror ? String(rawInst.ror).replace('https://ror.org/', '') : null,
        type: String(rawInst.type ?? ''),
      } : null,
    };
  } catch {
    return null;
  }
}

(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // ── Step 1: Hent forfatterpost fra DB ──────────────────────────────────────
  const { data: authorRow } = await db
    .from('authors')
    .select('display_name, city, country, state, hospital, department, geo_source, openalex_id, ror_id, created_at')
    .eq('id', AUTHOR_ID)
    .single();

  console.log(`\n[GEO-DEBUG ${D}] Forfatterpost i DB (nuværende tilstand):`);
  console.log(`  display_name: ${authorRow.display_name}`);
  console.log(`  city:         ${authorRow.city}`);
  console.log(`  country:      ${authorRow.country}`);
  console.log(`  state:        ${authorRow.state}`);
  console.log(`  hospital:     ${authorRow.hospital}`);
  console.log(`  department:   ${authorRow.department}`);
  console.log(`  geo_source:   ${authorRow.geo_source}`);
  console.log(`  openalex_id:  ${authorRow.openalex_id}`);
  console.log(`  ror_id:       ${authorRow.ror_id}`);
  console.log(`  created_at:   ${authorRow.created_at}`);

  // ── Step 2: Hent Roohollahis affiliation fra artiklen ─────────────────────
  const { data: article } = await db
    .from('articles')
    .select('authors')
    .eq('id', ARTICLE_ID)
    .single();

  const rawAuthors = article.authors as Record<string, unknown>[];
  const rooRaw = rawAuthors.find(a => a.lastName === 'Roohollahi');
  const affString: string | null =
    Array.isArray(rooRaw?.affiliations) && (rooRaw!.affiliations as string[]).length > 0
      ? (rooRaw!.affiliations as string[])[0]!
      : rooRaw?.affiliation != null
        ? String(rooRaw!.affiliation)
        : null;

  console.log(`\n[GEO-DEBUG ${D}] Step 2 — affiliationstekst:`);
  console.log(`  "${affString}"`);

  // ── Step 3: Parse affiliation (hvad parseren gav ved oprettelse) ──────────
  const parsed = affString ? await parseAffiliation(affString) : null;
  console.log(`\n[GEO-DEBUG ${D}] Step 3 — parseAffiliation:`);
  console.log(`  ${JSON.stringify(parsed)}`);

  // ── Step 4: OpenAlex lookup (hvad der skete ved oprettelse) ──────────────
  let oaInst: { displayName: string; ror: string | null; type: string } | null = null;

  if (authorRow.openalex_id) {
    console.log(`\n[GEO-DEBUG ${D}] Step 4 — fetchOpenAlexAuthor("${authorRow.openalex_id}")...`);
    const oaResult = await fetchOpenAlexAuthor(authorRow.openalex_id);
    console.log(`  displayName:  ${oaResult?.displayName ?? null}`);
    console.log(`  institution:  ${JSON.stringify(oaResult?.institution)}`);
    oaInst = oaResult?.institution ?? null;
  } else {
    console.log(`\n[GEO-DEBUG ${D}] Step 4 — ingen openalex_id, springer over`);
  }

  // Also check stored ror_id (may differ from current OA if OA has been updated)
  const rorIdToUse = oaInst?.ror ?? authorRow.ror_id ?? null;
  console.log(`\n[GEO-DEBUG ${D}] oaInst der ville bruges i createNewAuthor: ${JSON.stringify(oaInst)}`);
  console.log(`[GEO-DEBUG ${D}] ROR-id der ville bruges til fetchRorGeo: ${rorIdToUse}`);

  // ── Step 5: fetchRorGeo ────────────────────────────────────────────────────
  if (rorIdToUse) {
    console.log(`\n[GEO-DEBUG ${D}] Step 5 — fetchRorGeo("${rorIdToUse}")...`);
    const rorGeo = await fetchRorGeo(rorIdToUse);
    console.log(`  city:    ${rorGeo.city}`);
    console.log(`  state:   ${rorGeo.state}`);
    console.log(`  country: ${rorGeo.country}`);
    console.log(`  raw:     ${JSON.stringify(rorGeo.raw, null, 2)}`);

    // ── Step 6: Hvad createNewAuthor ville have sat ────────────────────────
    let city    = parsed?.city    ?? null;
    let state   = null;
    let country = parsed?.country ?? null;

    if (rorGeo.city)    city    = await resolveCityAlias(rorGeo.city, rorGeo.country ?? country ?? '');
    if (rorGeo.state)   state   = rorGeo.state;
    if (rorGeo.country) country = rorGeo.country;

    console.log(`\n[GEO-DEBUG ${D}] Step 6 — værdier inden authors.insert:`);
    console.log(`  city    (efter resolveCityAlias): ${city}`);
    console.log(`  state:                            ${state}`);
    console.log(`  country:                          ${country}`);
    console.log(`  geo_source:                       openalex`);
    console.log(`  hospital (fra oaInst):            ${oaInst?.displayName ?? parsed?.institution ?? null}`);
  } else {
    // Ingen ROR → kun parser-geo bruges
    console.log(`\n[GEO-DEBUG ${D}] Step 5 — ingen ROR-id, city fra parser: ${parsed?.city}`);
    console.log(`\n[GEO-DEBUG ${D}] Step 6 — værdier inden authors.insert:`);
    console.log(`  city:    ${parsed?.city ?? null}`);
    console.log(`  state:   null`);
    console.log(`  country: ${parsed?.country ?? null}`);
    console.log(`  geo_source: parser`);
  }
})();
