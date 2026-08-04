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
  rp3              TEXT,
  video_link       TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by       TEXT,
  decided_at       TIMESTAMPTZ
);

-- Added after initial launch: a device cookie + submission IP, used to
-- silently flag when a different Discord account applies from the same
-- device/network as an existing application. NULL for anything submitted
-- before this shipped — there's nothing to backfill those with.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_discord_id ON applications (discord_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_device_id ON applications (device_id);
CREATE INDEX IF NOT EXISTS idx_applications_ip_address ON applications (ip_address);

-- ===== IN-PROGRESS APPLICATION DRAFTS =====
-- Lets an applicant's in-progress answers follow their Discord account
-- across devices/browsers instead of being stuck in one browser's storage.
CREATE TABLE IF NOT EXISTS application_drafts (
  discord_id  TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ===== APP SETTINGS (single row, global flags) =====
-- Tracks whether the current batch of applications has been "sorted"
-- (locked into decision mode) by the owner. Server-side so every
-- staff member's dashboard agrees, and it survives page refreshes.
CREATE TABLE IF NOT EXISTS app_settings (
  id     INTEGER PRIMARY KEY DEFAULT 1,
  sorted BOOLEAN NOT NULL DEFAULT false,
  CHECK (id = 1)
);
INSERT INTO app_settings (id, sorted) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- NOTE: the session store (connect-pg-simple) creates its own
-- "user_sessions" table automatically on first run — nothing to add here.
