import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, ARTICLE_TYPE_TARGETS, TOTAL_TARGET, QUALIFICATION_FIELDS } from "@/lib/lab/value-scoring/craft-config";
import SampleClient from "./SampleClient";

export type Candidate = {
  id: string;
  article_type: string;
  prod_article_id: string;
  pubmed_id: string | null;
  title: string;
  journal: string | null;
  published_date: string | null;
  short_headline: string | null;
  short_resume: string | null;
  bottom_line: string | null;
  sari_subject: string | null;
  sari_action: string | null;
  sari_result: string | null;
  sari_implication: string | null;
};

export default async function CraftSamplePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Load module
  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase, status")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) notFound();

  // Load candidates
  const { data: rawCandidates } = await admin
    .from("lab_value_sample_candidates")
    .select("id, article_type, prod_article_id")
    .eq("module_id", mod.id)
    .order("article_type");

  const cands = (rawCandidates ?? []) as { id: string; article_type: string; prod_article_id: string }[];

  // Load article details from prod
  let candidates: Candidate[] = [];
  if (cands.length > 0) {
    const prodIds = cands.map(c => c.prod_article_id);
    const { data: articles } = await admin
      .from("articles")
      .select("id, pubmed_id, title, journal_abbr, published_date, short_headline, short_resume, bottom_line, sari_subject, sari_action, sari_result, sari_implication")
      .in("id", prodIds);

    type ArtRow = {
      id: string; pubmed_id: string | null; title: string; journal_abbr: string | null;
      published_date: string | null; short_headline: string | null; short_resume: string | null;
      bottom_line: string | null; sari_subject: string | null; sari_action: string | null;
      sari_result: string | null; sari_implication: string | null;
    };

    const artMap = new Map((articles as ArtRow[]).map(a => [a.id, a]));

    candidates = cands.map(c => {
      const a = artMap.get(c.prod_article_id);
      return {
        id:              c.id,
        article_type:    c.article_type,
        prod_article_id: c.prod_article_id,
        pubmed_id:       a?.pubmed_id       ?? null,
        title:           a?.title           ?? "(article not found)",
        journal:         a?.journal_abbr    ?? null,
        published_date:  a?.published_date  ?? null,
        short_headline:  a?.short_headline  ?? null,
        short_resume:    a?.short_resume    ?? null,
        bottom_line:     a?.bottom_line     ?? null,
        sari_subject:    a?.sari_subject    ?? null,
        sari_action:     a?.sari_action     ?? null,
        sari_result:     a?.sari_result     ?? null,
        sari_implication: a?.sari_implication ?? null,
      };
    });
  }

  return (
    <SampleClient
      moduleId={mod.id as string}
      phase={mod.phase as string}
      candidates={candidates}
      targets={ARTICLE_TYPE_TARGETS}
      totalTarget={TOTAL_TARGET}
      qualificationFields={[...QUALIFICATION_FIELDS]}
    />
  );
}
