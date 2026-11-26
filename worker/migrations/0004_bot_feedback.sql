-- Ящик предложений. update_id позволяет принять повторную доставку Telegram без дубля.
CREATE TABLE IF NOT EXISTS bot_feedback (
  id INTEGER PRIMARY KEY,
  update_id INTEGER NOT NULL UNIQUE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
