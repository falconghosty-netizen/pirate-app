-- ===== APPLICANTS' SUBMISSIONS =====
CREATE TABLE IF NOT EXISTS applications (
  id               SERIAL PRIMARY KEY,
  discord_id       TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  ign              TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('written', 'video')),
  about            TEXT,
  plans            TEXT,
  experience       TEXT,
  rp2              TEXT,
  video_link       TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by       TEXT,
  decided_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_applications_discord_id ON applications (discord_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

-- ===== STAFF RATINGS =====
-- staff_id refers to an admins.id (cast to text) — NOT a Discord ID anymore.
CREATE TABLE IF NOT EXISTS ratings (
  id               SERIAL PRIMARY KEY,
  application_id   INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  staff_id         TEXT NOT NULL,
  staff_username   TEXT NOT NULL,
  score            INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  rated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, staff_id)
);

-- ===== ADMIN ACCOUNTS =====
-- Username/password accounts, fully separate from Discord OAuth.
-- The very first account (created via the setup key) becomes 'owner'.
-- Everyone else signs up using an invite code the owner generates.
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== ADMIN INVITE CODES =====
CREATE TABLE IF NOT EXISTS admin_invite_codes (
  id         SERIAL PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at    TIMESTAMPTZ,
  used_by    TEXT
);

-- NOTE: the session store (connect-pg-simple) creates its own
-- "user_sessions" table automatically on first run — nothing to add here.
