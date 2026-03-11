/**
 * AI-powered affiliation parser using Claude Haiku.
 * Used as a fallback for low-confidence deterministic parser results.
 */

import { trackedCall } from "@/lib/ai/tracked-client";

export type AIParsedLocation = {
  department: string | null;
  institution: string | null;
  city: string | null;
  country: string | null;
};

const MODEL = process.env.AI_SCORING_MODEL || "claude-haiku-4-5-20251001";

export async function aiParseAffiliation(
  raw: string
): Promise<AIParsedLocation | null> {
  try {
    const response = await trackedCall("geo_ai_parse", {
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Parse this academic affiliation string into structured location fields.
Return ONLY valid JSON with these fields: { "department", "institution", "city", "country" }
Use null for any field you cannot confidently determine.
Normalize country names to their common English form (e.g., "People's Republic of China" → "China", "USA" → "United States", "UK" → "United Kingdom").

Affiliation: "${raw}"`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : null;
    if (!text) return null;

    // Strip markdown fences
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Extract JSON object: find first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);
    return {
      department: parsed.department ?? null,
      institution: parsed.institution ?? null,
      city: parsed.city ?? null,
      country: parsed.country ?? null,
    };
  } catch (e) {
    console.error("[geo/ai-parse] AI call failed:", e);
    return null;
  }
}
