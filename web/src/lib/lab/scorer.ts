import { trackedCall } from "@/lib/ai/tracked-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/lab/article-type-options";

export const SCORING_MODEL = process.env.AI_SCORING_MODEL ?? "claude-haiku-4-5-20251001";
export const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL ?? "claude-sonnet-4-20250514";

export interface ScoreResult {
  ai_decision: "approved" | "rejected";
  version: string;
}

export interface CondensationResult {
  short_headline: string;
  short_resume: string;
  bottom_line: string;
  pico_population: string | null;
  pico_intervention: string | null;
  pico_comparison: string | null;
  pico_outcome: string | null;
  sample_size: number | null;
  version: string;
}

export interface ClassificationResult {
  subspecialty: string[];
  reason: string;
  version: string;
}

export interface ActivePrompt {
  prompt: string;
  version: string;
}

export async function getActivePrompt(specialty: string, module: string): Promise<ActivePrompt> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("model_versions")
    .select("prompt_text, version")
    .eq("specialty", specialty)
    .eq("module", module)
    .eq("active", true)
    .limit(1)
    .single();

  if (!data?.prompt_text || !data?.version) {
    throw new Error(`No active prompt found for specialty: ${specialty}, module: ${module}`);
  }

  return { prompt: data.prompt_text as string, version: data.version as string };
}

export async function scoreArticle(
  article: { id?: string; title: string; abstract: string | null },
  specialty: string,
  activePrompt: ActivePrompt
): Promise<ScoreResult> {
  const content = activePrompt.prompt
    .replace(/\{\{specialty\}\}|\{specialty\}/g, specialty)
    .replace(/\{\{title\}\}|\{title\}/g,         article.title)
    .replace(/\{\{abstract\}\}|\{abstract\}/g,   article.abstract ?? "No abstract available");

  const message = await trackedCall(`specialty_tag_${activePrompt.version}`, {
    model: SCORING_MODEL,
    max_tokens: 20,
    thinking: { type: "disabled" },
    system: "You respond only with valid JSON. No explanation, no reasoning, no other text.",
    messages: [{ role: "user", content }],
  }, article.id, "specialty");

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as { decision?: number };
    const ai_decision: "approved" | "rejected" = parsed.decision === 1 ? "approved" : "rejected";
    return { ai_decision, version: activePrompt.version };
  } catch {
    return { ai_decision: "rejected", version: activePrompt.version };
  }
}

export async function scoreClassification(
  article: { id?: string; title: string; abstract: string | null },
  specialty: string,
  activePrompt: ActivePrompt
): Promise<ClassificationResult> {
  const subspecialties = await getSubspecialties(specialty);

  const content = activePrompt.prompt
    .replace(/\{\{specialty\}\}|\{specialty\}/g,                 specialty)
    .replace(/\{\{title\}\}|\{title\}/g,                         article.title)
    .replace(/\{\{abstract\}\}|\{abstract\}/g,                   article.abstract ?? "No abstract available")
    .replace(/\{\{subspecialty_list\}\}|\{subspecialty_list\}/g, subspecialties.join(", "));

  const message = await trackedCall(`subspecialty_${activePrompt.version}`, {
    model: SCORING_MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content }],
  }, article.id, "classification");

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  const subspecialtySet = new Set<string>(subspecialties);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      subspecialty?: string | string[];
      reason?: string;
    };

    // Handle both string and array responses from AI
    const rawSub = parsed.subspecialty;
    const subArr = Array.isArray(rawSub)
      ? rawSub
      : typeof rawSub === "string"
        ? [rawSub]
        : [];
    const PEDIATRIC = "Pediatric and foetal neurosurgery";
    const filtered = subArr.filter((s) => subspecialtySet.has(s));
    const maxSubs = filtered.includes(PEDIATRIC) ? 3 : 2;
    const subspecialty = filtered.slice(0, maxSubs);
    if (subspecialty.length === 0) subspecialty.push("Unknown");

    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : "";

    return { subspecialty, reason, version: activePrompt.version };
  } catch {
    return {
      subspecialty: ["Unknown"],
      reason: "Failed to parse AI response",
      version: activePrompt.version,
    };
  }
}

export interface ArticleTypeResult {
  article_type: string;
  confidence: number;
  rationale: string;
  version: string;
}

const ARTICLE_TYPE_ALIASES: Record<string, string> = {
  // Review variants
  "Systematic Review":           "Review",
  "Narrative Review":            "Review",
  "Scoping Review":              "Review",
  "Literature Review":           "Review",
  // Meta-analysis variants
  "Network Meta-analysis":       "Meta-analysis",
  "Systematic Meta-analysis":    "Meta-analysis",
  // Case variants
  "Case Report":                 "Case",
  "Case Series":                 "Case",
  // Intervention study variants
  "Clinical Trial":              "Intervention study",
  "RCT":                         "Intervention study",
  "Randomized Controlled Trial": "Intervention study",
  // Non-interventional study variants
  "Cohort Study":                "Non-interventional study",
  "Observational Study":         "Non-interventional study",
  "Retrospective Study":         "Non-interventional study",
  "Cross-sectional Study":       "Non-interventional study",
  // Surgical Technique variants
  "Technical Note":              "Surgical Technique",
  // Letters & Notices variants
  "Editorial":                   "Letters & Notices",
  "Letter":                      "Letters & Notices",
  "Letter to the Editor":        "Letters & Notices",
  "Comment":                     "Letters & Notices",
  "Erratum":                     "Letters & Notices",
  // Legacy fallback
  "Other":                       "Unclassified",
};

export async function scoreArticleType(
  article: {
    id?: string;
    title: string;
    abstract: string | null;
    journal_abbr?: string | null;
    journal_title?: string | null;
    mesh_terms?: unknown;
    publication_types?: unknown;
  },
  activePrompt: ActivePrompt
): Promise<ArticleTypeResult> {
  const journal = article.journal_abbr ?? article.journal_title ?? "Unknown";
  const meshTerms = Array.isArray(article.mesh_terms)
    ? (article.mesh_terms as string[]).join(", ")
    : "None";
  const pubTypes = Array.isArray(article.publication_types)
    ? (article.publication_types as string[]).join(", ")
    : "None";

  const content = activePrompt.prompt
    .replace(/\{\{title\}\}|\{title\}/g,                           article.title)
    .replace(/\{\{journal\}\}|\{journal\}/g,                       journal)
    .replace(/\{\{abstract\}\}|\{abstract\}/g,                     article.abstract ?? "No abstract available")
    .replace(/\{\{mesh_terms\}\}|\{mesh_terms\}/g,                 meshTerms)
    .replace(/\{\{publication_types\}\}|\{publication_types\}/g,   pubTypes);

  const message = await trackedCall(`article_type_${activePrompt.version}`, {
    model: SCORING_MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content }],
  }, article.id, "article_type");

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const articleTypeSet = new Set<string>(ARTICLE_TYPE_OPTIONS);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      article_type?: string;
      confidence?: number;
      rationale?: string;
    };

    const rawType = parsed.article_type;
    const article_type =
      typeof rawType === "string"
        ? articleTypeSet.has(rawType)
          ? rawType
          : ARTICLE_TYPE_ALIASES[rawType] ?? "Unclassified"
        : "Unclassified";
    const confidence = Math.min(99, Math.max(1, Math.round(Number(parsed.confidence ?? 50))));
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : "";

    return { article_type, confidence, rationale, version: activePrompt.version };
  } catch {
    return {
      article_type: "Unclassified",
      confidence: 50,
      rationale: "Failed to parse AI response",
      version: activePrompt.version,
    };
  }
}

export async function scoreCondensation(
  article: { id?: string; title: string; abstract: string | null },
  specialty: string,
  activePrompt: ActivePrompt
): Promise<CondensationResult> {
  const content = activePrompt.prompt
    .replace(/\{\{specialty\}\}|\{specialty\}/g, specialty)
    .replace(/\{\{title\}\}|\{title\}/g,         article.title)
    .replace(/\{\{abstract\}\}|\{abstract\}/g,   article.abstract ?? "No abstract available");

  const message = await trackedCall(`condensation_${activePrompt.version}`, {
    model: SCORING_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content }],
  }, article.id, "condensation");

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      short_headline?: string;
      short_resume?: string;
      bottom_line?: string;
      pico_population?: string;
      pico_intervention?: string;
      pico_comparison?: string;
      pico_outcome?: string;
      sample_size?: unknown;
    };

    const short_headline = typeof parsed.short_headline === "string" ? parsed.short_headline : "";
    const short_resume   = typeof parsed.short_resume === "string"   ? parsed.short_resume   : "";
    const bottom_line    = typeof parsed.bottom_line === "string"    ? parsed.bottom_line    : "";

    const pico_population   = typeof parsed.pico_population === "string"   ? parsed.pico_population   : null;
    const pico_intervention = typeof parsed.pico_intervention === "string" ? parsed.pico_intervention : null;
    const pico_comparison   = typeof parsed.pico_comparison === "string"   ? parsed.pico_comparison   : null;
    const pico_outcome      = typeof parsed.pico_outcome === "string"      ? parsed.pico_outcome      : null;

    const rawSize = Number(parsed.sample_size);
    const sample_size = Number.isFinite(rawSize) && rawSize > 0 ? Math.round(rawSize) : null;

    return {
      short_headline, short_resume, bottom_line,
      pico_population, pico_intervention, pico_comparison, pico_outcome,
      sample_size, version: activePrompt.version,
    };
  } catch {
    return {
      short_headline: "", short_resume: "", bottom_line: "",
      pico_population: null, pico_intervention: null, pico_comparison: null, pico_outcome: null,
      sample_size: null, version: activePrompt.version,
    };
  }
}
