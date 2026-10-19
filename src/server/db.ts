import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  name            TEXT NOT NULL,
  birthdate       TEXT NOT NULL,
  gender          TEXT,
  interested_in   TEXT NOT NULL DEFAULT '[]',
  city_id         TEXT,
  bio             TEXT NOT NULL DEFAULT '',
  training_times  TEXT NOT NULL DEFAULT '[]',
  frequency       INTEGER NOT NULL DEFAULT 3,
  goals           TEXT NOT NULL DEFAULT '[]',
  gym             TEXT NOT NULL DEFAULT '',
  workout_idea    TEXT NOT NULL DEFAULT '',
  age_min         INTEGER NOT NULL DEFAULT 18,
  age_max         INTEGER NOT NULL DEFAULT 99,
  max_distance_km INTEGER NOT NULL DEFAULT 50,
  language        TEXT NOT NULL DEFAULT 'en',
  onboarded       INTEGER NOT NULL DEFAULT 0,
  snoozed         INTEGER NOT NULL DEFAULT 0,
  verified        INTEGER NOT NULL DEFAULT 0,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  last_active_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sports (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport    TEXT NOT NULL,
  level    TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, sport)
);
CREATE INDEX IF NOT EXISTS user_sports_sport ON user_sports(sport);

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Append-only consent log (GDPR art. 7(1): be able to demonstrate consent).
CREATE TABLE IF NOT EXISTS consents (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  granted        INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  at             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS swipes (
  swiper_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('like', 'pass', 'spot')),
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (swiper_id, target_id)
);
CREATE INDEX IF NOT EXISTS swipes_target ON swipes(target_id);

CREATE TABLE IF NOT EXISTS matches (
  id               TEXT PRIMARY KEY,
  user_a           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_move_by    TEXT,
  first_message_by TEXT,
  replied_at       INTEGER,
  expires_at       INTEGER,
  extended         INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  UNIQUE (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS matches_b ON matches(user_b);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('text', 'invite')),
  body       TEXT NOT NULL DEFAULT '',
  invite     TEXT,
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS messages_match ON messages(match_id, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Kept when the reported account is deleted so trust & safety can still act (DSA art. 16).
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  INTEGER NOT NULL
);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run `fn` inside a transaction. node:sqlite has no helper for this yet. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
