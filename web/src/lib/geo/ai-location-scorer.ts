/**
 * AI-powered batch runner for low-confidence location articles.
 * Sends affiliations to Claude Haiku, cross-checks against deterministic parser results.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { aiParseAffiliation, type AIParsedLocation } from "./ai-location-parser";
import { lookupCountry } from "./country-map";

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

/** Normalize country to canonical form for comparison */
function normalizeCountry(raw: string | null): string | null {
  if (!raw) return null;
  return lookupCountry(raw) ?? raw.trim();
}

function countriesMatch(a: string | null, b: string | null): boolean {
  const na = normalizeCountry(a);
  const nb = normalizeCountry(b);
  if (!na || !nb) return false;
  return na.toLowerCase() === nb.toLowerCase();
}

type AuthorResult = "resolved" | "conflicted" | "failed" | "skipped";

function crossCheck(
  existing: { city: string | null; country: string | null; department: string | null; institution: string | null },
  aiResult: AIParsedLocation | null
): { result: AuthorResult; fields: { department: string | null; institution: string | null; city: string | null; country: string | null } } {
  if (!aiResult) {
    return { result: "failed", fields: existing };
  }

  // Case 2: Parser had null city or country, AI has values
  if ((!existing.city || !existing.country) && (aiResult.city || aiResult.country)) {
    return {
      result: "resolved",
      fields: {
        department: aiResult.department ?? existing.department,
        institution: aiResult.institution ?? existing.institution,
        city: aiResult.city ?? existing.city,
        country: aiResult.country ?? existing.country,
      },
    };
  }

  // Case 1: Countries agree
  if (countriesMatch(existing.country, aiResult.country)) {
    return {
      result: "resolved",
      fields: {
        department: aiResult.department ?? existing.department,
        institution: aiResult.institution ?? existing.institution,
        city: aiResult.city ?? existing.city,
        country: aiResult.country ?? existing.country,
      },
    };
  }

  // Case 3: Countries disagree
  return { result: "conflicted", fields: existing };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AILocationResult = {
  processed: number;
  upgraded: number;
  conflicted: number;
  failed: number;
};

export async function runAILocationParsing(
  limit = 100
): Promise<AILocationResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: articles, error } = await db
    .from("articles")
    .select(
      "id, authors, first_author_city, first_author_country, first_author_department, first_author_institution, last_author_city, last_author_country, last_author_department, last_author_institution"
    )
    .eq("location_confidence", "low")
    .not("location_parsed_at", "is", null)
    .eq("ai_location_attempted", false)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch articles: ${error.message}`);

  type ArticleRow = {
    id: string;
    authors: unknown;
    first_author_city: string | null;
    first_author_country: string | null;
    first_author_department: string | null;
    first_author_institution: string | null;
    last_author_city: string | null;
    last_author_country: string | null;
    last_author_department: string | null;
    last_author_institution: string | null;
  };

  const rows = (articles ?? []) as ArticleRow[];

  let processed = 0;
  let upgraded = 0;
  let conflicted = 0;
  let failed = 0;

  const updates: { id: string; fields: Record<string, unknown> }[] = [];

  for (const article of rows) {
    if (!Array.isArray(article.authors) || article.authors.length === 0) {
      // No authors — mark as attempted, skip
      updates.push({
        id: article.id,
        fields: { ai_location_attempted: true },
      });
      continue;
    }

    processed++;
    const authors = article.authors as AuthorEntry[];
    const firstAffiliation = getAffiliationString(authors[0]);
    const lastAffiliation =
      authors.length > 1
        ? getAffiliationString(authors[authors.length - 1])
        : null;

    // AI parse first author
    let firstAI: AIParsedLocation | null = null;
    if (firstAffiliation) {
      firstAI = await aiParseAffiliation(firstAffiliation);
      await delay(200);
    }

    // AI parse last author
    let lastAI: AIParsedLocation | null = null;
    if (lastAffiliation) {
      lastAI = await aiParseAffiliation(lastAffiliation);
      await delay(200);
    }

    // Cross-check first author
    const firstCheck = firstAffiliation
      ? crossCheck(
          {
            city: article.first_author_city,
            country: article.first_author_country,
            department: article.first_author_department,
            institution: article.first_author_institution,
          },
          firstAI
        )
      : { result: "skipped" as AuthorResult, fields: { department: article.first_author_department, institution: article.first_author_institution, city: article.first_author_city, country: article.first_author_country } };

    // Cross-check last author
    const lastCheck = lastAffiliation
      ? crossCheck(
          {
            city: article.last_author_city,
            country: article.last_author_country,
            department: article.last_author_department,
            institution: article.last_author_institution,
          },
          lastAI
        )
      : { result: "skipped" as AuthorResult, fields: { department: article.last_author_department, institution: article.last_author_institution, city: article.last_author_city, country: article.last_author_country } };

    // Determine overall outcome
    const results = [firstCheck.result, lastCheck.result].filter(
      (r) => r !== "skipped"
    );
    const hasConflict = results.includes("conflicted");
    const hasResolved = results.includes("resolved");
    const allFailed = results.every((r) => r === "failed");

    let newConfidence: "high" | "low" = "low";
    if (hasResolved && !hasConflict) {
      newConfidence = "high";
      upgraded++;
    } else if (hasConflict) {
      conflicted++;
    } else if (allFailed) {
      failed++;
    }

    updates.push({
      id: article.id,
      fields: {
        first_author_department: firstCheck.fields.department,
        first_author_institution: firstCheck.fields.institution,
        first_author_city: firstCheck.fields.city,
        first_author_country: firstCheck.fields.country,
        last_author_department: lastCheck.fields.department,
        last_author_institution: lastCheck.fields.institution,
        last_author_city: lastCheck.fields.city,
        last_author_country: lastCheck.fields.country,
        location_confidence: newConfidence,
        location_parsed_at: new Date().toISOString(),
        ai_location_attempted: true,
      },
    });
  }

  // Batch update in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((u) => db.from("articles").update(u.fields).eq("id", u.id))
    );
  }

  console.log(
    `[geo/ai-parse] Done: ${processed} processed, ${upgraded} upgraded, ${conflicted} conflicted, ${failed} failed`
  );

  return { processed, upgraded, conflicted, failed };
}
