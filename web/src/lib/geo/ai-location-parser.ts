/**
 * AI-powered affiliation parser using Claude Haiku.
 * Used as a fallback for low-confidence deterministic parser results.
 */

import { trackedCall } from "@/lib/ai/tracked-client";

export type AIParsedLocation = {
  department: string | null;
  institution: string | null;
  city: string | null;
  state: string | null;
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
Return ONLY valid JSON with these fields: { "department", "institution", "city", "state", "country" }
Use null for any field you cannot confidently determine.

Rules:
- "state" means state, province, prefecture, or equivalent administrative region (e.g., "California", "Ontario", "Guangdong", "Tokyo", "Maharashtra", "São Paulo", "Victoria")
- Normalize country names to their common English form (e.g., "People's Republic of China" → "China", "USA" → "United States", "UK" → "United Kingdom")
- For US affiliations, always include the state
- For China, include the province
- For Japan, include the prefecture
- For Canada, include the province
- For India, include the state
- For Brazil, include the state
- For Australia, include the state

Affiliation: "${raw}"`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : null;
    if (!text) return null;

    // Strip markdown fences
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Extract JSON - handle both single object and array
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    let parsed: Record<string, unknown>;

    if (firstBracket !== -1 && (firstBracket < firstBrace || firstBrace === -1)) {
      // Array response - parse array, take first element
      const lastBracket = cleaned.lastIndexOf(']');
      if (lastBracket === -1 || lastBracket <= firstBracket) return null;
      const arrStr = cleaned.substring(firstBracket, lastBracket + 1);
      const arr = JSON.parse(arrStr);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      parsed = arr[0];
    } else if (firstBrace !== -1) {
      // Single object response - find matching closing brace
      let depth = 0;
      let endIndex = -1;
      for (let i = firstBrace; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        if (cleaned[i] === '}') depth--;
        if (depth === 0) { endIndex = i; break; }
      }
      if (endIndex === -1) return null;
      const jsonStr = cleaned.substring(firstBrace, endIndex + 1);
      parsed = JSON.parse(jsonStr);
    } else {
      return null;
    }
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    return {
      department: str(parsed.department),
      institution: str(parsed.institution),
      city: str(parsed.city),
      state: str(parsed.state),
      country: str(parsed.country),
    };
  } catch (e) {
    console.error("[geo/ai-parse] AI call failed:", e);
    return null;
  }
}
