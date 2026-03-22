UPDATE public.lab_decisions ld
SET ai_reasoning = a.specialty_reasoning
FROM public.articles a
WHERE ld.article_id = a.id
  AND ld.ai_reasoning IS NULL
  AND a.specialty_reasoning IS NOT NULL;
