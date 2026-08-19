ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS request_email_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS confirmation_attendee_email_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS confirmation_host_email_sent_at TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_duration_minutes_range'
      AND conrelid = 'meetings'::regclass
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_duration_minutes_range
      CHECK (duration_minutes >= 5 AND duration_minutes <= 480);
  END IF;
END $$;
