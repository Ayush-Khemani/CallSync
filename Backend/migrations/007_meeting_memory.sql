ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS memory_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS memory_key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_unanswered_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_relationship_memory
  ON meetings (user_id, attendee_email, selected_slot DESC)
  WHERE status = 'confirmed';
