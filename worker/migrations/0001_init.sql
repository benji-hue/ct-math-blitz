-- Пользователи бота: только то, что нужно для напоминаний и лимитов.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,              -- Telegram user id
  first_name TEXT,
  username TEXT,
  can_message INTEGER NOT NULL DEFAULT 0, -- ученик запустил бота или разрешил сообщения
  reminders INTEGER NOT NULL DEFAULT 1,
  remind_hour INTEGER NOT NULL DEFAULT 18,
  tz TEXT NOT NULL DEFAULT 'Europe/Minsk',
  streak INTEGER NOT NULL DEFAULT 0,
  due INTEGER NOT NULL DEFAULT 0,
  last_study_day TEXT,
  last_reminded_day TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS users_reminders ON users (reminders, can_message, remind_hour);

-- Дневные лимиты запросов к ИИ.
CREATE TABLE IF NOT EXISTS usage (
  user_key TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_key, day, kind)
);

-- Обезличенные метрики продукта.
CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
