-- =============================================================
-- PulseFeed — Flow 1: User Foundation
-- Migration: 0001_flow1_users.sql
--
-- Creates:
--   1. public.users              (profile table extending auth.users)
--   2. set_updated_at()          (trigger function: auto-timestamp)
--   3. generate_referral_code()  (helper: unique 8-char code)
--   4. set_referral_code()       (trigger function: auto-assign on INSERT)
--   5. handle_new_user()         (trigger function: mirror auth.users → public.users)
--   6. Triggers wired to tables
--   7. RLS enabled + 4 policies
-- =============================================================


-- =============================================================
-- 1. TABLE: public.users
-- =============================================================

CREATE TABLE IF NOT EXISTS public.users (
  -- Primary key mirrors auth.users
  id               UUID          PRIMARY KEY
                                 REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  email            TEXT          UNIQUE NOT NULL,
  name             TEXT          NOT NULL DEFAULT '',
  role             TEXT          NOT NULL DEFAULT 'subscriber'
                                 CHECK (role IN ('subscriber', 'admin')),

  -- Newsletter preferences
  specialty_slugs  TEXT[]        NOT NULL DEFAULT '{}',
  subspecialties   JSONB         NOT NULL DEFAULT '{}',
  -- subspecialties shape: { "neurosurgery": ["Spine", "Oncology"], "cardiology": ["Interventional"] }

  frequency        TEXT          NOT NULL DEFAULT 'weekly'
                                 CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  email_format     TEXT          NOT NULL DEFAULT 'full'
                                 CHECK (email_format IN ('full', 'headlines')),

  -- Subscription status
  status           TEXT          NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'unsubscribed', 'paused')),
  paused_until     TIMESTAMPTZ,

  -- Onboarding
  onboarding_completed  BOOLEAN  NOT NULL DEFAULT FALSE,
  welcome_sent_at       TIMESTAMPTZ,

  -- Acquisition
  source           TEXT          NOT NULL DEFAULT 'website'
                                 CHECK (source IN ('website', 'referral', 'manual', 'import')),
  referral_code    TEXT          UNIQUE,
  referred_by_id   UUID          REFERENCES public.users(id) ON DELETE SET NULL,

  -- Metadata
  notes            TEXT          NOT NULL DEFAULT '',
  subscribed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  unsubscribed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS
  'User profiles extending auth.users. One row per authenticated user.';

COMMENT ON COLUMN public.users.subspecialties IS
  'JSONB map: specialty_slug → string[]. E.g. {"neurosurgery": ["Spine", "Oncology"]}';

COMMENT ON COLUMN public.users.referral_code IS
  '8-char uppercase alphanumeric code, auto-assigned on INSERT via trigger.';


-- =============================================================
-- 2. INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_users_status
  ON public.users (status);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role);

CREATE INDEX IF NOT EXISTS idx_users_specialty_slugs
  ON public.users USING gin (specialty_slugs);

CREATE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;


-- =============================================================
-- 3. FUNCTION: set_updated_at
--    Generic updated_at trigger — reusable across all tables
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- =============================================================
-- 4. FUNCTION: generate_referral_code
--    Returns a unique 8-char uppercase alphanumeric code
-- =============================================================

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code        TEXT;
  is_taken    BOOLEAN;
BEGIN
  LOOP
    -- 8 random uppercase hex chars, e.g. "A3F9C12B"
    code := upper(substring(md5(gen_random_uuid()::text) FROM 1 FOR 8));

    SELECT EXISTS (
      SELECT 1 FROM public.users WHERE referral_code = code
    ) INTO is_taken;

    EXIT WHEN NOT is_taken;
  END LOOP;

  RETURN code;
END;
$$;


-- =============================================================
-- 5. FUNCTION: set_referral_code
--    Auto-assigns referral_code on INSERT if not provided
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER users_set_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code();


-- =============================================================
-- 6. FUNCTION: handle_new_user
--    Mirrors a new auth.users row → public.users
--    SECURITY DEFINER so it can write without RLS
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ── Policy 1: Users read their own profile ───────────────────
CREATE POLICY "users: own select"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ── Policy 2: Users update their own profile ─────────────────
--    WITH CHECK prevents self-elevation of role
CREATE POLICY "users: own update"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Role cannot be changed by the user themselves
    AND role = (
      SELECT u.role FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- ── Policy 3: Admins read all users ──────────────────────────
--    Reads role from JWT app_metadata (set via Supabase admin API)
--    → avoids recursive RLS self-lookup
CREATE POLICY "users: admin select all"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ── Policy 4: Admins update all users ────────────────────────
CREATE POLICY "users: admin update all"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Note: INSERT is handled exclusively by handle_new_user() (SECURITY DEFINER).
-- Note: DELETE is not exposed — status = 'unsubscribed' is the soft-delete pattern.
-- Note: service_role bypasses RLS automatically (used by Python pipeline scripts).


-- =============================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- =============================================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'users';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'users';
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'users';
