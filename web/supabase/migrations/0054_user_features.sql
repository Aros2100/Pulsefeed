-- Migration 0054: User features — saved articles, reading history, projects, notifications, author follows
-- New columns on users, plus 5 new tables.
-- This migration was run manually before being committed. Idempotent via IF NOT EXISTS.

-- ── users: new columns ─────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT,
  ADD COLUMN IF NOT EXISTS is_public          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

-- ── projects ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "projects_owner" ON projects
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── saved_articles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_articles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  saved_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, article_id)
);
ALTER TABLE saved_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "saved_articles_owner" ON saved_articles
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── reading_history ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, article_id)
);
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "reading_history_owner" ON reading_history
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── author_follows ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS author_follows (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES authors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, author_id)
);
ALTER TABLE author_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "author_follows_owner" ON author_follows
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── notifications ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "notifications_owner" ON notifications
  USING (user_id = auth.uid());
