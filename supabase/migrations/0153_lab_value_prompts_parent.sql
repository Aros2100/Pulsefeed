-- Tracks which prompt version a new version was derived from. Used by the
-- iteration flow: pair-match for v_n falls back to v_(n-1)'s article scores
-- for articles not re-scored, and the new "Score disagreement articles only"
-- mode targets the articles that appeared in the parent's disagreements.

ALTER TABLE public.lab_value_prompts
  ADD COLUMN parent_prompt_id uuid REFERENCES public.lab_value_prompts(id) ON DELETE SET NULL;

CREATE INDEX lab_value_prompts_parent_idx ON public.lab_value_prompts(parent_prompt_id);
