-- CourtMixer cloud sync (spec §16.4). One row per synced document, keyed by the hashed sync code.
CREATE TABLE IF NOT EXISTS docs (
  account_id TEXT NOT NULL,
  doc_key    TEXT NOT NULL,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  size       INTEGER NOT NULL,
  PRIMARY KEY (account_id, doc_key)
);
-- Writes per account per UTC day (the daily cap).
CREATE TABLE IF NOT EXISTS usage (
  account_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  writes     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
