import CollapseAuthors from "./CollapseAuthors";
import CopyButton from "./CopyButton";

// ── Article data interface ────────────────────────────────────────────────────

export interface ArticleData {
  id: string;
  title: string;
  pubmed_id: string;
  doi: string | null;
  journal_abbr: string | null;
  journal_title: string | null;
  published_date: string | null;
  published_year: number | null;
  imported_at: string;
  volume: string | null;
  issue: string | null;
  article_number: string | null;
  abstract: string | null;
  authors: unknown;
  mesh_terms: unknown;
  grants: unknown;
  keywords: string[] | null;
  specialty_tags: string[];
  pico: unknown;
  publication_types: string[] | null;
  language: string | null;
  issn_electronic: string | null;
  issn_print: string | null;
  impact_factor:    number | null;
  journal_h_index:  number | null;
  citation_count:   number | null;
  evidence_score:   number | null;
  enriched_at: string | null;
  ai_decision: string | null;
  short_resume: string | null;
  news_value: number | null;
  clinical_relevance: string | null;
  // Classification (AI-scored)
  subspecialty_ai: string | null;
  classification_reason: string | null;
  classification_model_version: string | null;
  classification_scored_at: string | null;
  // Condensation (AI-scored)
  short_headline: string | null;
  bottom_line: string | null;
  pico_population: string | null;
  pico_intervention: string | null;
  pico_comparison: string | null;
  pico_outcome: string | null;
  sample_size: number | null;
  condensed_model_version: string | null;
  condensed_at: string | null;
  // Classification (computed)
  full_text_available: boolean | null;
  time_to_read: number | null;
  trial_registration: string | null;
  patient_population: string | null;
  pmc_id: string | null;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface Author   { lastName?: string; foreName?: string; affiliation?: string | null; affiliations?: string[] | null; orcid?: string | null }
interface MeshTerm { descriptor?: string; major?: boolean; qualifiers?: string[] }
interface Grant    { grantId?: string | null; agency?: string | null }
function cast<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g,            (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English", fre: "French",  ger: "German",
  spa: "Spanish", ita: "Italian", por: "Portuguese",
  chi: "Chinese", jpn: "Japanese", rus: "Russian",
};

// ── Card sub-components ───────────────────────────────────────────────────────

function Card({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      marginBottom: "12px",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function CardHeader({ label, green, right }: { label: string; green?: boolean; right?: React.ReactNode }) {
  return (
    <div style={{
      background: green ? "#f0f7ee" : "#EEF2F7",
      borderBottom: `1px solid ${green ? "#c8e6c0" : "#dde3ed"}`,
      padding: "10px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em",
        color: green ? "#3a7d44" : "#5a6a85",
        textTransform: "uppercase", fontWeight: 700,
      }}>
        {label}
      </div>
      {right}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 24px" }}>{children}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

type AuthorGeo = { department: string | null; hospital: string | null; city: string | null; state: string | null; country: string | null; verified_by: string | null };

export default function ArticleStamkort({ article, authorIdByPosition, authorScoreByPosition, authorGeoByPosition }: { article: ArticleData; authorIdByPosition?: Map<number, string>; authorScoreByPosition?: Map<number, number>; authorGeoByPosition?: Map<number, AuthorGeo | null> }) {
  const authors   = cast<Author>(article.authors);
  const meshTerms = cast<MeshTerm>(article.mesh_terms);
  const grants    = cast<Grant>(article.grants);
  const abstract  = article.abstract ? decodeHtml(article.abstract) : null;

  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`;
  const doiUrl    = article.doi ? `https://doi.org/${article.doi}` : null;

  const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const publishedDisplay = (() => {
    if (!article.published_date) return article.published_year ? String(article.published_year) : null;
    const d = new Date(article.published_date);
    return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  })();

  const firstAuthorCitation = authors.length > 0
    ? `${authors[0].lastName ?? ""}${authors.length > 1 ? " et al." : ""}`
    : "";
  const citationText = [
    firstAuthorCitation,
    article.title ? ` ${article.title}.` : "",
    article.journal_abbr ? ` ${article.journal_abbr}.` : "",
    publishedDisplay ? ` ${publishedDisplay};` : "",
    article.volume ?? "",
    article.issue ? `(${article.issue})` : "",
    article.article_number ? `:${article.article_number}.` : ".",
    doiUrl ? ` doi:${article.doi}` : "",
  ].filter(Boolean).join("");

  type FactRow = [string, React.ReactNode];
  function fr(label: string, value: React.ReactNode | null | undefined): FactRow | null {
    if (value === null || value === undefined) return null;
    return [label, value];
  }

  const factRows: FactRow[] = [
    fr("Journal",   article.journal_abbr ?? article.journal_title),
    fr("Published", publishedDisplay),
    article.volume
      ? fr("Volume / Issue", `${article.volume}${article.issue ? ` / ${article.issue}` : ""}`)
      : null,
    article.article_number ? fr("Article number", article.article_number) : null,
    authors.length
      ? fr("Authors", `${[authors[0].foreName, authors[0].lastName].filter(Boolean).join(" ")}${authors.length > 1 ? " et al." : ""}${(authors[0].affiliations?.[0] ?? authors[0].affiliation) ? ` · ${authors[0].affiliations?.[0] ?? authors[0].affiliation}` : ""}`)
      : null,
  ].filter((r): r is FactRow => r !== null);

  const factRows2: FactRow[] = [
    article.publication_types?.length
      ? fr("Publication type", article.publication_types[0])
      : null,
    article.language
      ? fr("Language", LANGUAGE_NAMES[article.language] ?? article.language.toUpperCase())
      : null,
    fr("PubMed", (
      <a href={pubmedUrl} target="_blank" rel="noopener noreferrer"
        style={{ color: "#1a6eb5", textDecoration: "none" }}>
        PMID {article.pubmed_id} ↗
      </a>
    )),
    doiUrl
      ? fr("DOI", (
          <a href={doiUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: "#1a6eb5", textDecoration: "none" }}>
            {article.doi} ↗
          </a>
        ))
      : null,
    (article.issn_electronic ?? article.issn_print)
      ? fr("ISSN", article.issn_electronic ?? article.issn_print)
      : null,
  ].filter((r): r is FactRow => r !== null);

  const abstractSections = abstract
    ? abstract.split(/\n/).reduce<{ label: string; text: string }[]>((acc, line) => {
        const match = line.match(/^([A-Z][A-Z /]+):?\s+(.+)/);
        if (match) {
          acc.push({ label: match[1], text: match[2] });
        } else if (acc.length > 0) {
          acc[acc.length - 1].text += " " + line;
        } else {
          acc.push({ label: "", text: line });
        }
        return acc;
      }, [])
    : null;

  return (
    <>
      {/* Facts */}
      <Card id="facts">
        <CardHeader label="Facts" />
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, fontSize: "14px" }}>
            <div>
              {factRows.map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ color: "#888" }}>{label}</span>
                  <span style={{ color: "#1a1a1a" }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: "20px" }}>
              {factRows2.map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ color: "#888" }}>{label}</span>
                  <span style={{ color: "#1a1a1a" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Keywords */}
      {article.keywords && article.keywords.length > 0 && (
        <Card id="keywords">
          <CardHeader label="Keywords" />
          <CardBody>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {article.keywords.map((kw, i) => (
                <span key={i} style={{ fontSize: "13px", background: "#fff", border: "1px solid #ccc", borderRadius: "4px", padding: "5px 12px", color: "#1a1a1a" }}>
                  {kw}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* MeSH Terms */}
      {meshTerms.length > 0 && (
        <Card id="mesh">
          <CardHeader label="MeSH Terms" />
          <CardBody>
            {[...meshTerms]
              .sort((a, b) => (a.descriptor ?? "").localeCompare(b.descriptor ?? ""))
              .map((m, i) => (
                <div key={i} style={{ fontSize: "14px", color: "#444", padding: "6px 0", borderBottom: i < meshTerms.length - 1 ? "1px solid #f5f5f5" : undefined }}>
                  {m.major
                    ? <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{m.descriptor}*</span>
                    : <span>{m.descriptor}</span>
                  }
                  {m.qualifiers && m.qualifiers.length > 0 && (
                    <span style={{ color: "#bbb" }}> / {m.qualifiers.join(" / ")}</span>
                  )}
                </div>
              ))
            }
          </CardBody>
        </Card>
      )}

      {/* Authors */}
      {authors.length > 0 && (
        <Card id="authors">
          <CardHeader label="Authors" />
          <CardBody>
            <CollapseAuthors authors={authors.map((a, i) => ({
              ...a,
              affiliation: null,
              id: authorIdByPosition?.get(i + 1) ?? undefined,
              author_score: authorScoreByPosition?.get(i + 1) ?? undefined,
              geo: authorGeoByPosition?.get(i + 1) ?? null,
            }))} />
          </CardBody>
        </Card>
      )}

      {/* Abstract */}
      {abstract && (
        <Card id="abstract">
          <CardHeader label="Abstract" />
          <CardBody>
            {abstractSections && abstractSections.some((s) => s.label) ? (
              abstractSections.map((s, i) => (
                <div key={i} style={{ marginBottom: i < abstractSections.length - 1 ? "18px" : 0 }}>
                  {s.label && (
                    <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5a6a85", display: "block", marginBottom: "5px" }}>
                      {s.label}
                    </span>
                  )}
                  <span style={{ fontSize: "15px", lineHeight: 1.85, color: "#2a2a2a" }}>{s.text}</span>
                </div>
              ))
            ) : (
              <p style={{ fontSize: "15px", lineHeight: 1.85, color: "#2a2a2a", margin: 0, whiteSpace: "pre-line" }}>
                {abstract}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Funding */}
      {grants.length > 0 && (
        <Card id="funding">
          <CardHeader label="Funding" />
          <CardBody>
            {grants.map((g, i) => (
              <div key={i} style={{ fontSize: "14px", padding: "8px 0", borderBottom: i < grants.length - 1 ? "1px solid #f5f5f5" : undefined }}>
                {g.grantId && <span style={{ fontWeight: 600 }}>{g.grantId}</span>}
                {g.agency  && <span style={{ color: "#666" }}> — {g.agency}</span>}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Citation */}
      <Card id="citation">
        <CardHeader label="Cite this article" />
        <CardBody>
          <div style={{ fontSize: "13px", lineHeight: 1.6, color: "#444", background: "#f9fafb", borderRadius: "6px", padding: "14px", border: "1px solid #eef2f7", fontFamily: "Georgia, serif" }}>
            {citationText}
          </div>
          <CopyButton text={citationText} />
        </CardBody>
      </Card>
    </>
  );
}
