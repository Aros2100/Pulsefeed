ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_type TEXT
    CHECK (role_type IN ('clinician', 'researcher', 'both'));
