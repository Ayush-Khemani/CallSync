ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS last_follow_up_provider TEXT,
  ADD COLUMN IF NOT EXISTS last_follow_up_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_meetings_follow_up_provider
  ON meetings (last_follow_up_provider)
  WHERE last_follow_up_provider IS NOT NULL;
