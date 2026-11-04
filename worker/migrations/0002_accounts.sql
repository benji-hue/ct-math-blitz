-- Аккаунт = Telegram-аккаунт ученика: прогресс хранится на сервере, чтобы он был
-- одним и тем же в мини-аппе, на сайте и на другом устройстве.
CREATE TABLE IF NOT EXISTS user_state (
  user_id INTEGER PRIMARY KEY,         -- Telegram user id
  state TEXT NOT NULL,                 -- снимок прогресса (JSON), без чата
  updated_at INTEGER NOT NULL,         -- когда снимок изменился на устройстве
  saved_at INTEGER NOT NULL            -- когда пришёл на сервер
);

-- Вход на сайте через бота: одноразовый запрос, ученик подтверждает его в чате с ботом.
CREATE TABLE IF NOT EXISTS login_requests (
  nonce TEXT PRIMARY KEY,
  code TEXT NOT NULL,                  -- код, который сайт показывает, а бот просит сверить
  created_at INTEGER NOT NULL,
  user_id INTEGER,                     -- заполняется после подтверждения в боте
  first_name TEXT,
  username TEXT
);

-- Сессии сайта. Сам токен знает только браузер ученика — здесь лишь его хэш.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
