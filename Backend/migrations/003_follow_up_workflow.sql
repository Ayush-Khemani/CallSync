ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS last_followed_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

UPDATE meetings
SET next_follow_up_at = created_at + INTERVAL '2 days'
WHERE status = 'pending'
  AND next_follow_up_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_pending_follow_up
  ON meetings (next_follow_up_at)
  WHERE status = 'pending';
