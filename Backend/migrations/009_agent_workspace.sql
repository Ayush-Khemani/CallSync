CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_user_updated
  ON agent_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_thread_created
  ON agent_messages(thread_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS agent_pending_actions (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  result JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_pending_actions_user_status
  ON agent_pending_actions(user_id, status, created_at DESC);
