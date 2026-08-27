CREATE TABLE IF NOT EXISTS meeting_actions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('outcome', 'manual', 'memory')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_actions_outcome_source
  ON meeting_actions (meeting_id, source)
  WHERE source = 'outcome';

CREATE INDEX IF NOT EXISTS idx_meeting_actions_open_due
  ON meeting_actions (user_id, due_at)
  WHERE status = 'open';

INSERT INTO meeting_actions (meeting_id, user_id, title, due_at, source)
SELECT id, user_id, outcome_next_step, outcome_follow_up_at, 'outcome'
FROM meetings
WHERE BTRIM(COALESCE(outcome_next_step, '')) <> ''
ON CONFLICT (meeting_id, source) WHERE source = 'outcome' DO NOTHING;
