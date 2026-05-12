// Asks an analysis-grade Claude model to propose a new prompt version based
// on the current prompt text and the clinician's pairwise disagreements.
// Pure analysis step: returns a suggestion without writing to the database.

import { trackedCall } from "@/lib/ai/tracked-client";
import { getDisagreements, type DisagreementRow } from "./evaluation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// Model used for iteration analysis. Sonnet 4.6 — enough room to read the
// current prompt and several dozen disagreements, with reasonable judgment.
const ITERATION_MODEL      = "claude-sonnet-4-6";
const ITERATION_MAX_TOKENS = 4000;

export interface IterationSuggestion {
  promptText:    string;
  changeNotes:   string;
  disagreementCount: number;
  promptVersion: number;
  rawResponse:   string;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function fmtDisagreement(d: DisagreementRow, i: number): string {
  const humanArt   = d.humanChoiceId === d.articleA.id ? d.articleA : d.articleB;
  const otherArt   = d.humanChoiceId === d.articleA.id ? d.articleB : d.articleA;
  const humanScore = d.humanChoiceId === d.articleA.id ? d.scoreA   : d.scoreB;
  const otherScore = d.humanChoiceId === d.articleA.id ? d.scoreB   : d.scoreA;

  const lines: string[] = [];
  lines.push(`Disagreement ${i + 1} (β diff ${d.betaDiff.toFixed(2)}):`);
  lines.push(`  Your choice (winner): "${truncate(humanArt.title, 160)}" [${humanArt.article_type ?? "—"}] · prompt score ${humanScore === null ? "—" : humanScore.toFixed(2)}`);
  lines.push(`  Prompt picked:        "${truncate(otherArt.title, 160)}" [${otherArt.article_type ?? "—"}] · prompt score ${otherScore === null ? "—" : otherScore.toFixed(2)}`);
  if (d.reasons.length > 0) lines.push(`  Your reasons: ${d.reasons.join(", ")}`);
  if (d.notes)              lines.push(`  Your notes: ${truncate(d.notes, 320)}`);
  return lines.join("\n");
}

export function buildIterationRequest(
  currentPromptText: string,
  disagreements: DisagreementRow[],
) {
  const blocks = disagreements.map(fmtDisagreement).join("\n\n");
  const system = [
    "You are improving a scoring prompt used by a clinical-newsletter editor.",
    "The prompt instructs Claude Haiku to score article 'craft' on a numerical scale.",
    "The clinician scored ~500 article pairs by hand and a Bradley-Terry ranking was derived from those choices.",
    "The current prompt was then used to score all 100 articles. Below you will see the disagreements: pairs where the prompt picked the article the clinician did not prefer.",
    "",
    "Your job: identify the systematic patterns in these disagreements (what kinds of articles does the prompt over- or under-value, what reasoning is the prompt missing, etc.) and propose a revised prompt that should produce better agreement with the clinician.",
    "",
    "Hard rules:",
    "- Keep the prompt's response contract: it must still instruct the model to return JSON of the form {\"score\": <number>, \"reasoning\": <string>}.",
    "- Do not add language about specialty, audience, or unrelated tasks — focus only on scoring craft.",
    "- Stay within the same numerical scale the current prompt uses.",
    "- Be specific about the heuristics the clinician's reasons reveal. Generic edits (\"be more careful\") are not useful.",
    "",
    "Respond with valid JSON only, no markdown fences, no prose around it:",
    "{",
    "  \"prompt_text\": \"<the full revised prompt as a single string>\",",
    "  \"change_notes\": \"<2-5 sentences describing the patterns you saw and what you changed and why>\"",
    "}",
  ].join("\n");

  const user = [
    "=== CURRENT PROMPT ===",
    currentPromptText.trim(),
    "",
    `=== DISAGREEMENTS (${disagreements.length}) ===`,
    blocks.length > 0 ? blocks : "(none)",
  ].join("\n");

  return {
    model:      ITERATION_MODEL,
    max_tokens: ITERATION_MAX_TOKENS,
    system,
    messages:   [{ role: "user" as const, content: user }],
  };
}

export function parseIterationResponse(rawText: string): { promptText: string; changeNotes: string } | null {
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { prompt_text?: unknown; change_notes?: unknown };
    const promptText  = typeof parsed.prompt_text  === "string" ? parsed.prompt_text.trim()  : "";
    const changeNotes = typeof parsed.change_notes === "string" ? parsed.change_notes.trim() : "";
    if (promptText.length === 0) return null;
    return { promptText, changeNotes };
  } catch {
    return null;
  }
}

export async function generatePromptIterationFromDisagreements(
  db: Db,
  promptId: string,
): Promise<IterationSuggestion> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("id, prompt_text, version")
    .eq("id", promptId)
    .maybeSingle();
  if (!prompt) throw new Error("Prompt not found");
  const p = prompt as { id: string; prompt_text: string; version: number };

  // Use the same disagreement source the evaluation page shows — but with
  // no minScoreDiff threshold here so the AI sees the full picture.
  const disagreements = await getDisagreements(db, promptId, { minScoreDiff: 0 });
  if (disagreements.length === 0) {
    throw new Error("No disagreements found for this prompt — nothing to iterate on");
  }

  const params = buildIterationRequest(p.prompt_text, disagreements);
  const modelKey = `value_scoring_craft_iterate_v${p.version}`;
  const message = await trackedCall(modelKey, params, undefined, "value_scoring_craft_iterate");
  const raw = (message.content[0] as { type: string; text: string }).text;

  const parsed = parseIterationResponse(raw);
  if (!parsed) {
    throw new Error("AI response could not be parsed — try again");
  }

  return {
    promptText:        parsed.promptText,
    changeNotes:       parsed.changeNotes,
    disagreementCount: disagreements.length,
    promptVersion:     p.version,
    rawResponse:       raw,
  };
}
