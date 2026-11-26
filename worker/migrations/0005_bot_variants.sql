-- Незавершённые посылки и архив материалов, прошедших первичную проверку.
CREATE TABLE bot_variant_drafts (
  chat_id INTEGER PRIMARY KEY,
  draft_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('pdf', 'photo')),
  files TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER NOT NULL,
  lock_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bot_variant_archive (
  id INTEGER PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  exam TEXT NOT NULL CHECK (exam IN ('rt', 'ct', 'ce')),
  exam_year INTEGER NOT NULL,
  files TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
