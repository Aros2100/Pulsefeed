/**
 * parse-single.ts
 *
 * Re-parse a single <PubmedArticle>...</PubmedArticle> XML fragment
 * to extract title and abstract. Uses the same XMLParser config and
 * decodeHtmlEntities as fetcher.ts — no network calls.
 */

import { XMLParser } from "fast-xml-parser";
import { decodeHtmlEntities, getText, toArray } from "./fetcher";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: false,
  isArray: (name) =>
    [
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

export function parseTitleAndAbstract(articleXml: string): {
  title: string;
  abstract: string | null;
} {
  const parsed = parser.parse(articleXml) as {
    PubmedArticle?: Record<string, unknown>;
  };

  const article = parsed.PubmedArticle;
  const citation = article?.MedlineCitation as Record<string, unknown> | undefined;
  const art = citation?.Article as Record<string, unknown> | undefined;

  const title = decodeHtmlEntities(getText(art?.ArticleTitle));

  const abstractParts = toArray(
    (art?.Abstract as Record<string, unknown> | undefined)?.AbstractText
  );
  const abstract =
    abstractParts.length > 0
      ? decodeHtmlEntities(
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

  return { title: title || "", abstract };
}
