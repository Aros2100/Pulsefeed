-- Remove "Neurosurgery" (the specialty name) from users.subspecialties arrays.
-- "Neurosurgery" was incorrectly stored as a mandatory subspecialty during onboarding;
-- it is the specialty itself and should never appear in the subspecialty list.

UPDATE public.users
SET subspecialties = (
  SELECT ARRAY_AGG(s ORDER BY s)
  FROM unnest(subspecialties) s
  WHERE s != 'Neurosurgery'
)
WHERE 'Neurosurgery' = ANY(subspecialties);

-- Verify: should return 0 rows after the update.
-- SELECT COUNT(*) FROM users WHERE 'Neurosurgery' = ANY(subspecialties);
