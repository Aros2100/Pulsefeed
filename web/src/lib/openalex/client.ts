import pLimit from "p-limit";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface OpenAlexInstitution {
  id: string;
  displayName: string;
  ror: string | null;
  countryCode: string;
  type: string;
}

export interface OpenAlexAuthorInfo {
  id: string;
  displayName: string;
  orcid: string | null;
}

export interface OpenAlexAuthorship {
  authorPosition: "first" | "middle" | "last";
  author: OpenAlexAuthorInfo;
  countries: string[];
  institutions: OpenAlexInstitution[];
  rawAffiliationStrings: string[];
  isCorresponding: boolean;
}

export interface OpenAlexWork {
  id: string;
  doi: string;
  citedByCount: number;
  fwci: number | null;
  type: string;
  authorships: OpenAlexAuthorship[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const OPENALEX_BASE = "https://api.openalex.org";

function apiKey(): string | null {
  return process.env.OPENALEX_API_KEY ?? null;
}

function mailto(): string {
  return process.env.OPENALEX_EMAIL ?? "info@pulsefeed.dk";
}

function stripPrefix(url: string, prefix: string): string {
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return url;
}

function cleanDoi(doi: string): string {
  return stripPrefix(doi, "https://doi.org/");
}

// ── Parsers ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInstitution(raw: any): OpenAlexInstitution {
  return {
    id: stripPrefix(String(raw.id ?? ""), "https://openalex.org/"),
    displayName: String(raw.display_name ?? ""),
    ror: raw.ror ? stripPrefix(String(raw.ror), "https://ror.org/") : null,
    countryCode: String(raw.country_code ?? ""),
    type: String(raw.type ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAuthorship(raw: any): OpenAlexAuthorship {
  const author = raw.author ?? {};
  return {
    authorPosition: raw.author_position ?? "middle",
    author: {
      id: stripPrefix(String(author.id ?? ""), "https://openalex.org/"),
      displayName: String(author.display_name ?? ""),
      orcid: author.orcid
        ? stripPrefix(String(author.orcid), "https://orcid.org/")
        : null,
    },
    countries: Array.isArray(raw.countries) ? raw.countries : [],
    institutions: Array.isArray(raw.institutions)
      ? raw.institutions.map(parseInstitution)
      : [],
    rawAffiliationStrings: Array.isArray(raw.raw_affiliation_strings)
      ? raw.raw_affiliation_strings
      : [],
    isCorresponding: Boolean(raw.is_corresponding),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWork(raw: any): OpenAlexWork {
  const doi = raw.doi ? stripPrefix(String(raw.doi), "https://doi.org/") : "";
  return {
    id: stripPrefix(String(raw.id ?? ""), "https://openalex.org/"),
    doi,
    citedByCount: Number(raw.cited_by_count ?? 0),
    fwci: raw.fwci != null ? Number(raw.fwci) : null,
    type: String(raw.type ?? ""),
    authorships: Array.isArray(raw.authorships)
      ? raw.authorships.map(parseAuthorship)
      : [],
  };
}

// ── API functions ───────────────────────────────────────────────────────────────

function buildParams(): URLSearchParams {
  const params = new URLSearchParams({ mailto: mailto() });
  const key = apiKey();
  if (key) params.set("api_key", key);
  return params;
}

export async function fetchWorkByDoi(
  doi: string
): Promise<OpenAlexWork | null> {
  const clean = cleanDoi(doi);
  try {
    const params = buildParams();
    const url = `${OPENALEX_BASE}/works/doi:${clean}?${params}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      headers: { "User-Agent": `pulsefeed/1.0 (mailto:${mailto()})` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[openalex] fetchWorkByDoi ${clean}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    return parseWork(data);
  } catch (err) {
    console.warn(
      `[openalex] fetchWorkByDoi ${clean}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 200;

export async function fetchWorksByDois(
  dois: string[]
): Promise<Map<string, OpenAlexWork>> {
  const result = new Map<string, OpenAlexWork>();
  if (dois.length === 0) return result;

  const cleanDois = dois.map(cleanDoi);

  // Chunk into groups of 50
  const chunks: string[][] = [];
  for (let i = 0; i < cleanDois.length; i += CHUNK_SIZE) {
    chunks.push(cleanDois.slice(i, i + CHUNK_SIZE));
  }

  const limiter = pLimit(5);
  let first = true;

  await Promise.all(
    chunks.map((chunk, idx) =>
      limiter(async () => {
        // Delay between chunks (skip first)
        if (!first) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
        first = false;

        try {
          const filter = `doi:${chunk.join("|")}`;
          const params = buildParams();
          params.set("filter", filter);
          params.set("per_page", "200");

          const url = `${OPENALEX_BASE}/works?${params}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);

          const res = await fetch(url, {
            headers: { "User-Agent": `pulsefeed/1.0 (mailto:${mailto()})` },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!res.ok) {
            console.warn(
              `[openalex] batch chunk ${idx + 1}/${chunks.length}: HTTP ${res.status}`
            );
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = (await res.json()) as { results?: any[] };
          for (const raw of data.results ?? []) {
            const work = parseWork(raw);
            if (work.doi) {
              result.set(work.doi.toLowerCase(), work);
            }
          }
        } catch (err) {
          console.warn(
            `[openalex] batch chunk ${idx + 1}/${chunks.length}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })
    )
  );

  console.log(
    `[openalex] batch: ${result.size}/${dois.length} works found`
  );
  return result;
}
