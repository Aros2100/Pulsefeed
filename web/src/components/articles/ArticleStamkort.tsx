import { SPECIALTIES } from "@/lib/auth/specialties";
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
  enriched_at: string | null;
  ai_decision: string | null;
  short_resume: string | null;
  news_value: number | null;
  clinical_relevance: string | null;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface Author   { lastName?: string; foreName?: string; affiliation?: string | null; orcid?: string | null }
interface MeshTerm { descriptor?: string; major?: boolean; qualifiers?: string[] }
interface Grant    { grantId?: string | null; agency?: string | null }
interface PicoData { population?: string; intervention?: string; comparison?: string; outcome?: string }

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

function stars(value: number | null): React.ReactNode {
  if (!value) return null;
  const v = Math.round(Math.max(1, Math.min(5, value)));
  return (
    <>
      {"★".repeat(v)}
      <span style={{ color: "#ddd" }}>{"★".repeat(5 - v)}</span>
    </>
  );
}

function specialtyLabel(slug: string): string {
  return SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
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

export default function ArticleStamkort({ article }: { article: ArticleData }) {
  const authors   = cast<Author>(article.authors);
  const meshTerms = cast<MeshTerm>(article.mesh_terms);
  const grants    = cast<Grant>(article.grants);
  const pico      = article.pico as PicoData | null;
  const abstract  = article.abstract ? decodeHtml(article.abstract) : null;
  const isEnriched = !!article.enriched_at;

  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`;
  const doiUrl    = article.doi ? `https://doi.org/${article.doi}` : null;

  const topSpecialty = article.specialty_tags[0]
    ? specialtyLabel(article.specialty_tags[0])
    : null;

  const publishedDisplay = article.published_date
    ? new Date(article.published_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : article.published_year ? String(article.published_year) : null;

  const importedDisplay = (() => {
    const d = new Date(article.imported_at);
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} at ${time}`;
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
      ? fr("Authors", `${[authors[0].foreName, authors[0].lastName].filter(Boolean).join(" ")}${authors.length > 1 ? " et al." : ""}${authors[0].affiliation ? ` · ${authors[0].affiliation}` : ""}`)
      : null,
    fr("Imported", importedDisplay),
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
      {/* Title card */}
      <Card>
        <CardHeader label={topSpecialty ?? "Article"} />
        <CardBody>
          <h1 style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "23px", fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
            {article.title}
          </h1>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "10px" }}>
            {article.journal_abbr && `${article.journal_abbr} · `}
            {publishedDisplay && `${publishedDisplay} · `}
            <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
              PMID {article.pubmed_id}
            </a>
            {doiUrl && (
              <> · <a href={doiUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>DOI ↗</a></>
            )}
          </div>
        </CardBody>
      </Card>

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

      {/* AI Summary */}
      {isEnriched && article.short_resume && (
        <Card id="ai-summary">
          <CardHeader label="AI Summary" green />
          <CardBody>
            <div style={{ fontSize: "15px", lineHeight: 1.75, color: "#1a1a1a" }}>
              {article.short_resume}
            </div>
            <div style={{ display: "flex", gap: "32px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e8f0e8" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>News Value</div>
                <div style={{ fontSize: "18px", letterSpacing: "2px", color: "#f4a100" }}>
                  {stars(article.news_value)}
                </div>
              </div>
              {article.clinical_relevance && (
                <div>
                  <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Clinical Relevance</div>
                  <span style={{
                    display: "inline-block", fontSize: "12px",
                    background: article.clinical_relevance.toLowerCase().includes("practice") ? "#fff3e0" : "#e8f4e8",
                    color:      article.clinical_relevance.toLowerCase().includes("practice") ? "#e65100"  : "#2d7a2d",
                    padding: "4px 12px", borderRadius: "20px", fontWeight: 600,
                  }}>
                    {article.clinical_relevance}
                  </span>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* PICO */}
      {isEnriched && pico && (pico.population || pico.intervention || pico.comparison || pico.outcome) && (
        <Card id="pico">
          <CardHeader label="PICO" green />
          <CardBody>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {([
                { label: "Population",   value: pico.population },
                { label: "Intervention", value: pico.intervention },
                { label: "Comparison",   value: pico.comparison },
                { label: "Outcome",      value: pico.outcome },
              ] as { label: string; value: string | undefined }[])
                .filter((p) => p.value)
                .map((p) => (
                  <div key={p.label} style={{ background: "#f9fafb", borderRadius: "8px", padding: "14px", border: "1px solid #eef2f7" }}>
                    <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px", fontWeight: 600 }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: 1.5, color: "#2a2a2a" }}>{p.value}</div>
                  </div>
                ))
              }
            </div>
          </CardBody>
        </Card>
      )}

      {/* Authors */}
      {authors.length > 0 && (
        <Card id="authors">
          <CardHeader label="Authors" />
          <CardBody>
            <CollapseAuthors authors={authors.map((a) => ({
              ...a,
              affiliation: a.affiliation ? decodeHtml(a.affiliation) : a.affiliation,
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
