-- Общий банк заданий от ИИ: задание, которое составила одна модель и подтвердила вторая,
-- получают и другие ученики — без новых запросов к ИИ и без расхода их дневного лимита.
CREATE TABLE IF NOT EXISTS bank_tasks (
  id TEXT PRIMARY KEY,                 -- ai.<предмет>.<случайная строка>
  subject TEXT NOT NULL,               -- math, phys, …
  topic TEXT NOT NULL,                 -- id темы приложения (p.dc, m.trig, …)
  subject_title TEXT NOT NULL,         -- для повторной проверки по жалобе
  part TEXT NOT NULL,                  -- A или B
  level INTEGER NOT NULL,
  task TEXT NOT NULL,                  -- задание в JSON: q, options, answer, explain, hint, trap
  created_at INTEGER NOT NULL,
  served INTEGER NOT NULL DEFAULT 0,   -- сколько раз выдано из банка
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0    -- 1 — снято по жалобам или после перепроверки
);

CREATE INDEX IF NOT EXISTS bank_topic ON bank_tasks (subject, topic, hidden);

-- Жалобы «Ошибка в задании» — и на задания ИИ, и на встроенные (их правит автор банка).
CREATE TABLE IF NOT EXISTS bank_reports (
  task_id TEXT NOT NULL,
  reporter TEXT NOT NULL,              -- ключ ученика (tg:<id> или ip:<адрес>), один голос на задание
  reason TEXT NOT NULL,                -- answer | statement | other
  note TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (task_id, reporter)
);
