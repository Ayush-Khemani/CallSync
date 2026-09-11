ALTER TABLE agent_pending_actions
  DROP CONSTRAINT IF EXISTS agent_pending_actions_status_check;

ALTER TABLE agent_pending_actions
  ADD CONSTRAINT agent_pending_actions_status_check
  CHECK (status IN ('pending', 'executing', 'confirmed', 'cancelled', 'expired', 'failed'));
