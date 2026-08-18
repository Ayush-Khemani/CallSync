ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_happened BOOLEAN,
  ADD COLUMN IF NOT EXISTS meeting_useful BOOLEAN,
  ADD COLUMN IF NOT EXISTS outcome_next_step TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS outcome_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_outcome_follow_up
  ON meetings (outcome_follow_up_at)
  WHERE outcome_follow_up_at IS NOT NULL;
