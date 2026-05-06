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
  'Guideline':                 8,
};

export const TOTAL_TARGET = Object.values(ARTICLE_TYPE_TARGETS).reduce((s, n) => s + n, 0); // 98

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
