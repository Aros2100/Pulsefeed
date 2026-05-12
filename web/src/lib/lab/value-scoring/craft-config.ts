// Configuration for the Craft value-scoring module.
// All sampling criteria live here — not scattered across route handlers.

export const CRAFT_MODULE_KEY = {
  module_type: 'value_scoring' as const,
  parameter:   'craft' as const,
  specialty:   'neurosurgery' as const,
};

// Target number of articles per article_type in the sample
export const ARTICLE_TYPE_TARGETS: Record<string, number> = {
  'Non-interventional study': 10,
  'Case':                     10,
  'Basic study':              10,
  'Review':                   10,
  'Meta-analysis':            10,
  'Intervention study':       10,
  'Tech':                     10,
  'Surgical Technique':       10,
  'Administration':           10,
  'Guideline':                10,
};

export const TOTAL_TARGET = Object.values(ARTICLE_TYPE_TARGETS).reduce((s, n) => s + n, 0); // 100

// Fields that must all be NOT NULL for an article to qualify
export const QUALIFICATION_FIELDS = [
  'short_headline',
  'short_resume',
  'bottom_line',
  'sari_subject',
  'sari_action',
  'sari_result',
  'sari_implication',
] as const;

// article_type values excluded from sampling
export const EXCLUDED_ARTICLE_TYPES = ['Letters & Notices'];

// ── Pairwise phase ───────────────────────────────────────────────────────────

export const PAIRS_PER_ARTICLE     = 10;
export const INITIAL_PAIR_BATCH    = 500;
export const SESSION_SIZE          = 25;

export const INITIAL_REASON_CATEGORIES = [
  'Method',
  'Sample size',
  'Statistical analysis',
  'Reporting quality',
  'Reproducibility',
  'Generalizability',
] as const;

// ── Prompt phase ─────────────────────────────────────────────────────────────

// Minimum decided pairs before the prompt phase is meaningful.
export const MIN_PAIRS_FOR_PROMPT = 250;

// Anthropic model used to score articles with a prompt version.
// Haiku with thinking disabled, mirroring the conventions in lib/lab/scorer.ts.
export const SCORING_MODEL      = 'claude-haiku-4-5-20251001';
export const SCORING_MAX_TOKENS = 1000;

// Articles are scored in parallel chunks to keep total wall time low while
// respecting Anthropic concurrency limits.
export const SCORING_CONCURRENCY = 10;

// Quick-test sampling: pick this many articles from the top, bottom, and
// middle of the Bradley-Terry ranking. The sum is the quick-test batch size.
export const QUICK_TEST_TOP    = 5;
export const QUICK_TEST_BOTTOM = 5;
export const QUICK_TEST_MIDDLE = 5;
export const QUICK_TEST_TOTAL  = QUICK_TEST_TOP + QUICK_TEST_BOTTOM + QUICK_TEST_MIDDLE;

