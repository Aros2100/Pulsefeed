export const ARTICLE_TYPE_DISAGREEMENT_THRESHOLD = 50;

export const ARTICLE_TYPE_OPTIONS = [
  "Meta-analysis",
  "Review",
  "Intervention study",
  "Non-interventional study",
  "Basic study",
  "Case",
  "Guideline",
  "Technique & Technology",
  "Administration",
  "Letters & Notices",
] as const;

export type ArticleTypeOption = typeof ARTICLE_TYPE_OPTIONS[number];
