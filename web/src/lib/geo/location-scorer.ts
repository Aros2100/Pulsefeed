/**
 * Batch runner: parse author affiliations for articles that haven't been parsed yet.
 * Uses the deterministic affiliation parser — no AI, no external APIs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation, type ParsedAffiliation } from "./affiliation-parser";

type AuthorEntry = {
  affiliation?: string | null;
  affiliations?: string[] | null;
};

function getAffiliationString(author: AuthorEntry): string | null {
  if (typeof author.affiliation === "string" && author.affiliation.trim()) {
    return author.affiliation;
  }
  if (Array.isArray(author.affiliations) && author.affiliations.length > 0) {
    return author.affiliations[0] ?? null;
  }
  return null;
}

export async function runLocationParsing(limit = 500): Promise<{
  parsed: number;
  highConfidence: number;
  lowConfidence: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  console.log("[geo/run-parse] Starting parse, targeting unparsed articles");

  const { data: articles, error } = await db
    .from("articles")
    .select("id, authors")
    .is("location_parsed_at", null)
    .not("authors", "is", null)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  const rows = (articles ?? []) as { id: string; authors: unknown }[];

  // Filter to articles with non-empty authors array
  const eligible = rows.filter((r) => {
    if (!Array.isArray(r.authors)) return false;
    return r.authors.length > 0;
  });

  let parsed = 0;
  let highConfidence = 0;
  let lowConfidence = 0;
  let skipped = 0;

  // Build update payloads
  type UpdatePayload = {
    id: string;
    first_author_department: string | null;
    first_author_institution: string | null;
    first_author_city: string | null;
    first_author_country: string | null;
    last_author_department: string | null;
    last_author_institution: string | null;
    last_author_city: string | null;
    last_author_country: string | null;
    location_parsed_at: string;
    location_confidence: "high" | "low" | null;
  };

  const updates: UpdatePayload[] = [];

  for (const article of eligible) {
    const authors = article.authors as AuthorEntry[];
    const firstAuthor = authors[0];
    const lastAuthor = authors.length > 1 ? authors[authors.length - 1] : null;

    const firstParsed = parseAffiliation(getAffiliationString(firstAuthor));
    const lastParsed = lastAuthor
      ? parseAffiliation(getAffiliationString(lastAuthor))
      : null;

    const now = new Date().toISOString();

    if (!firstParsed && !lastParsed) {
      // Both null — skip but still mark as parsed
      skipped++;
      updates.push({
        id: article.id,
        first_author_department: null,
        first_author_institution: null,
        first_author_city: null,
        first_author_country: null,
        last_author_department: null,
        last_author_institution: null,
        last_author_city: null,
        last_author_country: null,
        location_parsed_at: now,
        location_confidence: null,
      });
      continue;
    }

    // Determine overall confidence
    let overallConfidence: "high" | "low";
    if (firstParsed && lastParsed) {
      overallConfidence =
        firstParsed.confidence === "low" || lastParsed.confidence === "low"
          ? "low"
          : "high";
    } else {
      // One is null, take the other's confidence
      const onlyParsed = (firstParsed ?? lastParsed) as ParsedAffiliation;
      overallConfidence = onlyParsed.confidence;
    }

    parsed++;
    if (overallConfidence === "high") highConfidence++;
    else lowConfidence++;

    updates.push({
      id: article.id,
      first_author_department: firstParsed?.department ?? null,
      first_author_institution: firstParsed?.institution ?? null,
      first_author_city: firstParsed?.city ?? null,
      first_author_country: firstParsed?.country ?? null,
      last_author_department: lastParsed?.department ?? null,
      last_author_institution: lastParsed?.institution ?? null,
      last_author_city: lastParsed?.city ?? null,
      last_author_country: lastParsed?.country ?? null,
      location_parsed_at: now,
      location_confidence: overallConfidence,
    });
  }

  // Also mark non-eligible rows (no authors array) as parsed so we don't retry
  const nonEligible = rows.filter((r) => !Array.isArray(r.authors) || r.authors.length === 0);
  for (const article of nonEligible) {
    skipped++;
    updates.push({
      id: article.id,
      first_author_department: null,
      first_author_institution: null,
      first_author_city: null,
      first_author_country: null,
      last_author_department: null,
      last_author_institution: null,
      last_author_city: null,
      last_author_country: null,
      location_parsed_at: new Date().toISOString(),
      location_confidence: null,
    });
  }

  // Batch update in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => {
        const { id, ...fields } = u;
        return db.from("articles").update(fields).eq("id", id);
      })
    );
  }

  return { parsed, highConfidence, lowConfidence, skipped };
}

/**
 * One-time re-parse of previously low-confidence articles.
 * Call after parser improvements to upgrade results. Not meant for loops.
 */
export async function reparseLowConfidence(limit = 500): Promise<{
  parsed: number;
  highConfidence: number;
  lowConfidence: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: articles, error } = await db
    .from("articles")
    .select("id, authors")
    .eq("location_confidence", "low")
    .not("location_parsed_at", "is", null)
    .not("authors", "is", null)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  const rows = (articles ?? []) as { id: string; authors: unknown }[];

  let parsed = 0;
  let highConfidence = 0;
  let lowConfidence = 0;

  const CHUNK_SIZE = 50;
  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const article of rows) {
    if (!Array.isArray(article.authors) || article.authors.length === 0) continue;

    const authors = article.authors as AuthorEntry[];
    const firstParsed = parseAffiliation(getAffiliationString(authors[0]));
    const lastParsed = authors.length > 1
      ? parseAffiliation(getAffiliationString(authors[authors.length - 1]))
      : null;

    let overallConfidence: "high" | "low" | null = null;
    if (firstParsed && lastParsed) {
      overallConfidence = firstParsed.confidence === "low" || lastParsed.confidence === "low" ? "low" : "high";
    } else if (firstParsed || lastParsed) {
      overallConfidence = ((firstParsed ?? lastParsed) as ParsedAffiliation).confidence;
    }

    parsed++;
    if (overallConfidence === "high") highConfidence++;
    else lowConfidence++;

    updates.push({
      id: article.id,
      fields: {
        first_author_department: firstParsed?.department ?? null,
        first_author_institution: firstParsed?.institution ?? null,
        first_author_city: firstParsed?.city ?? null,
        first_author_country: firstParsed?.country ?? null,
        last_author_department: lastParsed?.department ?? null,
        last_author_institution: lastParsed?.institution ?? null,
        last_author_city: lastParsed?.city ?? null,
        last_author_country: lastParsed?.country ?? null,
        location_parsed_at: new Date().toISOString(),
        location_confidence: overallConfidence,
      },
    });
  }

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => db.from("articles").update(u.fields).eq("id", u.id))
    );
  }

  return { parsed, highConfidence, lowConfidence };
}
