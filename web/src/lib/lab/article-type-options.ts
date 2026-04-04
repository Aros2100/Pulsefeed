export const ARTICLE_TYPE_DISAGREEMENT_THRESHOLD = 0;

export const ARTICLE_TYPE_OPTIONS = [
  "Meta-analysis",
  "Review",
  "Intervention study",
  "Non-interventional study",
  "Basic study",
  "Case",
  "Guideline",
  "Surgical Technique",
  "Tech",
  "Administration",
  "Letters & Notices",
] as const;

export type ArticleTypeOption = typeof ARTICLE_TYPE_OPTIONS[number];

export const ARTICLE_TYPE_METADATA: { value: ArticleTypeOption; isStudyType: boolean }[] = [
  { value: "Meta-analysis",            isStudyType: true },
  { value: "Review",                   isStudyType: true },
  { value: "Intervention study",       isStudyType: true },
  { value: "Non-interventional study", isStudyType: true },
  { value: "Basic study",              isStudyType: true },
  { value: "Case",                     isStudyType: true },
  { value: "Guideline",                isStudyType: false },
  { value: "Surgical Technique",       isStudyType: false },
  { value: "Tech",                     isStudyType: false },
  { value: "Administration",           isStudyType: false },
  { value: "Letters & Notices",        isStudyType: false },
];
