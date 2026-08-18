ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS meeting_goal TEXT,
  ADD COLUMN IF NOT EXISTS invite_message TEXT,
  ADD COLUMN IF NOT EXISTS qualification_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guest_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '';

UPDATE meetings
SET meeting_type = COALESCE(meeting_type, 'General meeting'),
    meeting_goal = COALESCE(meeting_goal, ''),
    invite_message = COALESCE(invite_message, '')
WHERE meeting_type IS NULL OR meeting_goal IS NULL OR invite_message IS NULL;
