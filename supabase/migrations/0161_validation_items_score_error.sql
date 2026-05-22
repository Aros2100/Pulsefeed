-- Track per-item scoring failures so runs can transition correctly.
-- NULL = not yet attempted or successfully scored.
-- Non-null = scoring failed; the value is the error message.

ALTER TABLE public.lab_value_validation_items
  ADD COLUMN score_error text;
