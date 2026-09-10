const pool = require('../db/pool');
const HttpError = require('../utils/httpError');

function mapAction(row) {
  return {
    actionId: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    dueAt: row.due_at,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function updateTaskStatus({ userId, actionId, status }) {
  const id = Number(actionId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Valid action ID required');
  if (!['open', 'completed'].includes(status)) throw new HttpError(400, 'Task status must be open or completed');

  const existingResult = await pool.query(
    'SELECT * FROM meeting_actions WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new HttpError(404, 'Action not found');

  const completedAt = status === 'completed'
    ? (existing.status === 'completed' && existing.completed_at ? existing.completed_at : new Date().toISOString())
    : null;

  const result = await pool.query(
    `UPDATE meeting_actions
     SET status = $1,
         completed_at = $2,
         updated_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING id, meeting_id, title, due_at, status, source, created_at, updated_at, completed_at`,
    [status, completedAt, id, userId]
  );

  return {
    message: status === 'completed' ? 'Task completed' : 'Task reopened',
    action: mapAction(result.rows[0]),
  };
}

module.exports = { updateTaskStatus, _test: { mapAction } };
