-- Add validator_notes to lab_value_validation_items.
-- Stores free-text observations recorded by the validator on the outcome screen.
-- Nullable — the field is optional.

ALTER TABLE public.lab_value_validation_items
  ADD COLUMN validator_notes text;

-- Verify no unintended changes (no tables to check for new rowsecurity here, just a column add)
