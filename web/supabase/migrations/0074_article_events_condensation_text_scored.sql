-- Add condensation_text_scored to article_events event_type constraint.
-- Find the existing constraint name and recreate it with the new value.

DO $$
DECLARE
  constraint_name text;
  constraint_def  text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
  INTO constraint_name, constraint_def
  FROM pg_constraint
  WHERE conrelid = 'public.article_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL AND constraint_def NOT ILIKE '%condensation_text_scored%' THEN
    -- Drop old constraint and add new one with the extra value
    EXECUTE format('ALTER TABLE public.article_events DROP CONSTRAINT %I', constraint_name);
    EXECUTE replace(
      constraint_def,
      ')',
      ', ''condensation_text_scored'')'
    );
    -- Recreate
    EXECUTE format(
      'ALTER TABLE public.article_events ADD CONSTRAINT %I %s',
      constraint_name,
      replace(constraint_def, ')', ', ''condensation_text_scored'')')
    );
    RAISE NOTICE 'Added condensation_text_scored to constraint %', constraint_name;
  ELSIF constraint_name IS NULL THEN
    RAISE NOTICE 'No event_type check constraint found on article_events — skipping';
  ELSE
    RAISE NOTICE 'condensation_text_scored already present in constraint % — skipping', constraint_name;
  END IF;
END
$$;
