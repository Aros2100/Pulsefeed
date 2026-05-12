// Asks an analysis-grade Claude model to propose a new prompt version based
// on the current prompt text and the clinician's pairwise disagreements.
// Pure analysis step: returns a suggestion without writing to the database.

import { trackedCall } from "@/lib/ai/tracked-client";
import { getDisagreements, type DisagreementRow } from "./evaluation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// Sonnet for iteration: revising an existing prompt against concrete
// disagreements is a constrained task that Sonnet handles well.
const ITERATION_MODEL      = "claude-sonnet-4-6";
const ITERATION_MAX_TOKENS = 4000;

// Opus for v1: writing the first prompt requires ignoring the most obvious
// pattern in the data (article_type) in favour of the subtler one
// (execution quality). That kind of nuance is worth the Opus call — v1 is
// the foundation every later iteration builds on.
const V1_MODEL      = "claude-opus-4-7";
const V1_MAX_TOKENS = 4000;

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

// Returns the trimmed value or "—" for empty/null. Used in v1 generation
// where we send the full text (no truncation) so Opus sees the ground truth.
function full(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.trim();
  return t.length > 0 ? t : "—";
}

function fmtDisagreement(d: DisagreementRow, i: number): string {
  const humanArt   = d.humanChoiceId === d.articleA.id ? d.articleA : d.articleB;
  const otherArt   = d.humanChoiceId === d.articleA.id ? d.articleB : d.articleA;
  const humanScore = d.humanChoiceId === d.articleA.id ? d.scoreA   : d.scoreB;
  const otherScore = d.humanChoiceId === d.articleA.id ? d.scoreB   : d.scoreA;

  const lines: string[] = [];
  lines.push(`Disagreement ${i + 1} (BT score diff ${d.normalizedDiff.toFixed(1)}):`);
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
    "Return ONLY valid JSON — no preamble, no analysis, no explanation before or after. Your entire response must be a single JSON object and nothing else:",
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

/**
 * Extract the first well-formed JSON object from the text using a brace
 * depth counter. This is more robust than a greedy regex because:
 * - Prose before the JSON is skipped (stops at first `{`)
 * - Trailing text after the closing `}` is ignored
 * - Nested `{}` inside string values are handled correctly
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape)                       { escape = false; continue; }
    if (c === "\\" && inString)       { escape = true;  continue; }
    if (c === '"')                    { inString = !inString; continue; }
    if (inString)                     { continue; }
    if (c === "{")                    { depth++; }
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export function parseIterationResponse(rawText: string): { promptText: string; changeNotes: string } | null {
  // Strip markdown fences as belt-and-suspenders (model sometimes wraps JSON).
  const stripped = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  try {
    const jsonStr = extractFirstJsonObject(stripped);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr) as { prompt_text?: unknown; change_notes?: unknown };
    const promptText  = typeof parsed.prompt_text  === "string" ? parsed.prompt_text.trim()  : "";
    const changeNotes = typeof parsed.change_notes === "string" ? parsed.change_notes.trim() : "";
    if (promptText.length === 0) return null;
    return { promptText, changeNotes };
  } catch {
    return null;
  }
}

// ── v1 generation from pairwise data ─────────────────────────────────────────

export interface V1Suggestion {
  promptText:  string;
  changeNotes: string;
  summary: {
    decidedPairs:  number;
    rankedArticles: number;
    topCategories: { label: string; count: number }[];
    examplePairs:  number;
  };
  rawResponse: string;
}

interface Sari {
  subject?:     string | null;
  action?:      string | null;
  result?:      string | null;
  implication?: string | null;
}

interface ArticleFull {
  id:              string;
  title:           string;
  journal:         string | null;
  article_type:    string | null;
  short_headline:  string | null;
  resume:          string | null;
  bottom_line:     string | null;
  sari:            Sari | null;
  normalizedScore: number | null;
}

function fmtArticleBlock(label: string, a: ArticleFull): string {
  const sari = a.sari ?? {};
  return [
    `${label} (BT score ${a.normalizedScore === null ? "—" : a.normalizedScore.toFixed(1)})`,
    `  Title: ${a.title}`,
    `  Article type: ${a.article_type ?? "—"} · Journal: ${a.journal ?? "—"}`,
    `  Short headline: ${full(a.short_headline)}`,
    `  Resume: ${full(a.resume)}`,
    `  Bottom line: ${full(a.bottom_line)}`,
    `  SARI subject: ${full(sari.subject)}`,
    `  SARI action: ${full(sari.action)}`,
    `  SARI result: ${full(sari.result)}`,
    `  SARI implication: ${full(sari.implication)}`,
  ].join("\n");
}

interface PairExample {
  winner:    { title: string; article_type: string | null; normalizedScore: number | null };
  loser:     { title: string; article_type: string | null; normalizedScore: number | null };
  reasons:   string[];
  notes:     string | null;
  btDiff:    number;
}

function fmtPairExample(p: PairExample, i: number): string {
  const lines: string[] = [];
  lines.push(`Pair ${i + 1} (BT diff ${p.btDiff.toFixed(1)}):`);
  lines.push(`  Winner: "${p.winner.title}" [${p.winner.article_type ?? "—"}] · BT ${p.winner.normalizedScore === null ? "—" : p.winner.normalizedScore.toFixed(1)}`);
  lines.push(`  Loser:  "${p.loser.title}" [${p.loser.article_type  ?? "—"}] · BT ${p.loser.normalizedScore  === null ? "—" : p.loser.normalizedScore.toFixed(1)}`);
  if (p.reasons.length > 0) lines.push(`  Reasons: ${p.reasons.join(", ")}`);
  if (p.notes)              lines.push(`  Notes: ${full(p.notes)}`);
  return lines.join("\n");
}

export function buildV1Request(
  allArticles:   ArticleFull[],
  topCategories: { label: string; count: number }[],
  allPairs:      PairExample[],
  totalDecided:  number,
) {
  const categoryStats = topCategories.length === 0
    ? "(no reason categories used)"
    : topCategories.map(c => `  ${c.label}: ${c.count}×`).join("\n");

  // All articles, sorted by BT desc. Numbered so Opus can refer back.
  const articleBlocks = allArticles.map((a, i) => fmtArticleBlock(`Article #${i + 1}`, a)).join("\n\n");
  const pairBlocks    = allPairs.map(fmtPairExample).join("\n\n");

  const system = [
    "You are writing the first version of a scoring prompt for a clinical-newsletter editor.",
    "The prompt will instruct Claude Haiku to score the 'craft' of medical research articles on a 1-10 scale.",
    "",
    "=== WHAT CRAFT MEANS ===",
    "CRAFT means the quality of the work itself — the methodology, rigor, reporting,",
    "and execution of the study. It is NOT a measure of:",
    "- Importance, novelty, or breakthrough potential",
    "- Clinical actionability or practice-changing potential",
    "- Value to a clinician reading the article",
    "- Breadth of clinical impact",
    "",
    "Craft asks: \"Regardless of whether this finding matters, was it done well?\"",
    "",
    "A well-conducted case report can have high craft. A poorly-designed RCT",
    "can have low craft. The scoring must reflect the quality of execution,",
    "not the strategic value of the topic.",
    "=== END DEFINITION ===",
    "",
    "=== CRITICAL CONSTRAINT: NO ARTICLE_TYPE-BASED SCORING ===",
    "Do NOT generate a prompt that locks score ranges to article_type.",
    "Article_type is NOT a craft signal.",
    "",
    "- A poorly-conducted RCT must be able to score lower than a well-executed",
    "  case report.",
    "- A sloppy meta-analysis must be able to score lower than a rigorous",
    "  single-center cohort.",
    "- A well-reported case report with clean methodology must be able to",
    "  outscore a meta-analysis with poor heterogeneity handling.",
    "",
    "The generated prompt must evaluate craft on study-specific execution",
    "signals (study design appropriateness for the question, statistical",
    "rigor, reporting transparency, methodology) — NOT on category of article.",
    "",
    "Use article_type ONLY as context for what to look for (e.g., \"for a",
    "case report, evaluate reporting completeness; for a meta-analysis,",
    "evaluate search strategy transparency\"), NEVER as a score cap or floor.",
    "",
    "If the generated prompt contains language like \"Case report: typically",
    "1-4\" or \"Meta-analysis: can score 7-10\", that is a failure of this",
    "constraint.",
    "=== END CONSTRAINT ===",
    "",
    `The clinician has already scored ~${totalDecided} pairs of articles by hand, leaving categorised reasons and notes.`,
    "A Bradley-Terry ranking was derived from those pairwise choices — articles with high BT scores are the clinician's preferred work, and low BT scores are the rejected work.",
    "",
    "Your job: infer the clinician's implicit craft scoring criteria from the data and produce a scoring prompt that captures them.",
    "",
    "Hard rules:",
    "- The prompt MUST instruct Claude to return only JSON with exactly these keys:",
    "  {",
    "    \"craft_score\": <number 20-100>,",
    "    \"dimensions\": {",
    "      \"bias\": <1-5>,",
    "      \"statistical_analyses\": <1-5>,",
    "      \"study_design\": <1-5>,",
    "      \"outcome_quality\": <1-5>,",
    "      \"sample_size\": <1-5>,",
    "      \"intervention_integrity\": <1-5>,",
    "      \"protocol_adherence\": <1-5>,",
    "      \"consistency\": <1-5>,",
    "      \"generalizability\": <1-5>,",
    "      \"reproducibility\": <1-5>",
    "    },",
    "    \"reasoning\": \"<2-4 sentences summarizing strongest and weakest dimensions>\"",
    "  }",
    "- The 20-100 scale should match how the BT ranking distributes: 100 looks like the top of the BT ranking (Article #1), 20 looks like the bottom (last article).",
    "- Do NOT ask the model to map craft_score onto a 1-10 scale — return the raw craft_score directly.",
    "- The prompt should be self-contained — assume Claude only sees: title, article_type, journal, and abstract. Abstract may be unavailable for some articles (letters, editorials).",
    "- Criteria in the generated prompt MUST be about HOW the work was done (study design rigor, statistical handling, reporting quality, methodological transparency, reproducibility), NOT about WHAT it concerns (clinical relevance, actionability, importance to practice).",
    "- If clinician reasons mention strategic value or clinical importance, treat that as background context — focus on the methodological elements they emphasised.",
    "- Reflect the actual dimensions the clinician cares about (visible in the reason categories and notes). Generic platitudes are not useful — be specific.",
    "- Do not embed the example articles verbatim in the prompt. The prompt should generalise the patterns, not memorise these specific 100 articles.",
    "",
    "Respond with valid JSON only, no markdown fences, no prose around it:",
    "{",
    "  \"prompt_text\": \"<the full prompt as a single string>\",",
    "  \"change_notes\": \"<2-5 sentences: what craft criteria you inferred and how you wove them into the prompt>\"",
    "}",
  ].join("\n");

  const user = [
    `=== CATEGORY USAGE (top reason categories across all ${totalDecided} pairs) ===`,
    categoryStats,
    "",
    `=== ALL ${allArticles.length} ARTICLES (sorted by BT score descending — #1 is the clinician's most preferred work) ===`,
    articleBlocks.length > 0 ? articleBlocks : "(none)",
    "",
    `=== ALL ${allPairs.length} DECIDED PAIRS (sorted by BT difference descending — clearest preferences first) ===`,
    pairBlocks.length > 0 ? pairBlocks : "(none)",
  ].join("\n");

  return {
    model:      V1_MODEL,
    max_tokens: V1_MAX_TOKENS,
    system,
    messages:   [{ role: "user" as const, content: user }],
  };
}

/**
 * Generate a first prompt version from pairwise data alone, with no parent
 * prompt to iterate from. Sends Opus the full ground truth: every ranked
 * article (sorted by BT score desc) with its full text fields, every
 * decided pair (sorted by BT diff desc) with reasons and untruncated notes,
 * plus the reason-category usage histogram. Returns {prompt_text, change_notes}.
 */
export async function generatePromptV1FromPairwise(db: Db, moduleId: string): Promise<V1Suggestion> {
  // Articles
  const { data: articleRows } = await db
    .from("lab_value_articles")
    .select("id, title, journal, article_type, short_headline, resume, bottom_line, sari")
    .eq("module_id", moduleId);
  type ArticleDbRow = { id: string; title: string; journal: string | null; article_type: string | null; short_headline: string | null; resume: string | null; bottom_line: string | null; sari: Sari | null };
  const articles = (articleRows ?? []) as ArticleDbRow[];
  const articleMap = new Map<string, ArticleDbRow>(articles.map(a => [a.id, a]));

  // BT rankings
  const { data: rankingRows } = await db
    .from("lab_value_rankings")
    .select("article_id, normalized_score")
    .eq("module_id", moduleId);
  type RankRow = { article_id: string; normalized_score: number | string | null };
  const normalizedMap = new Map<string, number>();
  for (const r of (rankingRows ?? []) as RankRow[]) {
    if (r.normalized_score !== null && r.normalized_score !== undefined) {
      normalizedMap.set(r.article_id, Number(r.normalized_score));
    }
  }
  if (normalizedMap.size === 0) {
    throw new Error("Bradley-Terry ranking has not been computed yet — compute it before generating v1");
  }

  // Decided pairs
  const { data: pairRows } = await db
    .from("lab_value_pairs")
    .select("id, article_a_id, article_b_id, winner_id")
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);
  type PairRow = { id: string; article_a_id: string; article_b_id: string; winner_id: string };
  const decided = (pairRows ?? []) as PairRow[];
  if (decided.length === 0) {
    throw new Error("No decided pairs found — finish pairwise scoring before generating v1");
  }

  // Reasons + categories
  const pairIds = decided.map(p => p.id);
  const [{ data: reasonRows }, { data: catRows }] = await Promise.all([
    db.from("lab_value_pair_reasons").select("pair_id, category_id, notes").in("pair_id", pairIds),
    db.from("lab_value_reason_categories").select("id, label").eq("module_id", moduleId),
  ]);
  type ReasonRow = { pair_id: string; category_id: string; notes: string | null };
  type CatRow    = { id: string; label: string };
  const catLabel = new Map<string, string>(((catRows ?? []) as CatRow[]).map(c => [c.id, c.label]));

  const reasonsByPair = new Map<string, { labels: Set<string>; notes: Set<string> }>();
  const categoryCount = new Map<string, number>();
  for (const r of (reasonRows ?? []) as ReasonRow[]) {
    const label = catLabel.get(r.category_id);
    if (label) {
      categoryCount.set(label, (categoryCount.get(label) ?? 0) + 1);
      let entry = reasonsByPair.get(r.pair_id);
      if (!entry) { entry = { labels: new Set(), notes: new Set() }; reasonsByPair.set(r.pair_id, entry); }
      entry.labels.add(label);
      if (r.notes && r.notes.trim().length > 0) entry.notes.add(r.notes.trim());
    }
  }
  const topCategories = [...categoryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, count]) => ({ label, count }));

  // All articles with BT scores, sorted by BT descending
  const allArticles: ArticleFull[] = articles
    .map(a => ({ ...a, normalizedScore: normalizedMap.get(a.id) ?? null }))
    .filter(a => a.normalizedScore !== null)
    .sort((a, b) => (b.normalizedScore as number) - (a.normalizedScore as number));

  // All decided pairs, sorted by BT difference descending (clearest preferences first)
  const allPairs: PairExample[] = [];
  for (const p of decided) {
    const winnerArt = articleMap.get(p.winner_id);
    const loserId   = p.winner_id === p.article_a_id ? p.article_b_id : p.article_a_id;
    const loserArt  = articleMap.get(loserId);
    if (!winnerArt || !loserArt) continue;
    const winnerScore = normalizedMap.get(p.winner_id) ?? null;
    const loserScore  = normalizedMap.get(loserId)     ?? null;
    const btDiff = (winnerScore !== null && loserScore !== null) ? Math.abs(winnerScore - loserScore) : 0;
    const r = reasonsByPair.get(p.id);
    const reasons = r ? [...r.labels].sort() : [];
    const notes   = r && r.notes.size > 0 ? [...r.notes].join(" · ") : null;
    allPairs.push({
      winner: { title: winnerArt.title, article_type: winnerArt.article_type, normalizedScore: winnerScore },
      loser:  { title: loserArt.title,  article_type: loserArt.article_type,  normalizedScore: loserScore  },
      reasons, notes, btDiff,
    });
  }
  allPairs.sort((a, b) => b.btDiff - a.btDiff);

  const params = buildV1Request(allArticles, topCategories, allPairs, decided.length);
  const modelKey = `value_scoring_craft_generate_v1`;
  const message = await trackedCall(modelKey, params, undefined, "value_scoring_craft_generate_v1");
  const raw = (message.content[0] as { type: string; text: string }).text;

  const parsed = parseIterationResponse(raw);
  if (!parsed) {
    throw new Error("AI response could not be parsed — try again");
  }

  return {
    promptText:  parsed.promptText,
    changeNotes: parsed.changeNotes,
    summary: {
      decidedPairs:   decided.length,
      rankedArticles: allArticles.length,
      topCategories,
      examplePairs:   allPairs.length,
    },
    rawResponse: raw,
  };
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

  console.log(`[iterate v${p.version}] raw response (first 600 chars):\n${raw.slice(0, 600)}`);

  const parsed = parseIterationResponse(raw);
  if (!parsed) {
    console.error(`[iterate v${p.version}] PARSE FAILED. Full raw response:\n${raw}`);
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
