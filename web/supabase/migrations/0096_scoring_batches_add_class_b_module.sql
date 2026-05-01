-- Migration 0096: Add article_geo_class_b to scoring_batches module allowlist

ALTER TABLE public.scoring_batches
  DROP CONSTRAINT scoring_batches_module_check;

ALTER TABLE public.scoring_batches
  ADD CONSTRAINT scoring_batches_module_check
  CHECK (module = ANY (ARRAY[
    'specialty'::text,
    'subspecialty'::text,
    'article_type_prod'::text,
    'condensation_text'::text,
    'condensation_sari'::text,
    'article_geo_class_a'::text,
    'article_geo_class_b'::text
  ]));
