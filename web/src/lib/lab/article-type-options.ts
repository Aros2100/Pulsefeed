import { createAdminClient } from "@/lib/supabase/admin";

export const ARTICLE_TYPE_DISAGREEMENT_THRESHOLD = 0;

export type ArticleTypeOption = string;

export async function getArticleTypes(specialty: string): Promise<{ code: number; name: string; is_study_type: boolean; sort_order: number }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("article_types")
    .select("code, name, is_study_type, sort_order")
    .eq("specialty", specialty)
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

// @deprecated Use getArticleTypes(specialty) instead
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
  "Unclassified",
] as const;

// @deprecated Use getArticleTypes(specialty) instead
export const ARTICLE_TYPE_METADATA: { value: string; isStudyType: boolean }[] = [
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
  { value: "Unclassified",             isStudyType: false },
];
