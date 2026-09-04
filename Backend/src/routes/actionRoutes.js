const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const router = express.Router();

function cleanTitle(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 5000);
}

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'dueAt must be a valid date');
  return date.toISOString();
}

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
    attendeeName: row.attendee_name || '',
    attendeeEmail: row.attendee_email || '',
    meetingType: row.meeting_type || '',
  };
}

router.get('/actions', authMiddleware, asyncHandler(async (req, res) => {
  const requestedStatus = String(req.query.status || 'all').toLowerCase();
  if (!['all', 'open', 'completed'].includes(requestedStatus)) {
    throw new HttpError(400, 'status must be all, open, or completed');
  }

  const requestedMeetingId = req.query.meetingId === undefined ? null : Number(req.query.meetingId);
  if (requestedMeetingId !== null && !Number.isInteger(requestedMeetingId)) {
    throw new HttpError(400, 'meetingId must be a valid meeting ID');
  }

  const params = [req.userId];
  const filters = [];
  if (requestedStatus !== 'all') {
    params.push(requestedStatus);
    filters.push(`a.status = ${params.length}`);
  }
  if (requestedMeetingId !== null) {
    params.push(requestedMeetingId);
    filters.push(`a.meeting_id = ${params.length}`);
  }
  const filterClause = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
      a.id,
      a.meeting_id,
      a.title,
      a.due_at,
      a.status,
      a.source,
      a.created_at,
      a.updated_at,
      a.completed_at,
      m.attendee_name,
      m.attendee_email,
      m.meeting_type
    FROM meeting_actions a
    JOIN meetings m ON m.id = a.meeting_id
    WHERE a.user_id = $1 ${filterClause}
    ORDER BY
      CASE WHEN a.status = 'open' THEN 0 ELSE 1 END,
      a.due_at ASC NULLS LAST,
      a.created_at ASC`,
    params
  );

  res.json({ actions: result.rows.map(mapAction) });
}));

router.post('/meetings/:id/actions', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) throw new HttpError(400, 'Valid meeting ID required');

  const title = cleanTitle(req.body.title);
  if (!title) throw new HttpError(400, 'Action title is required');
  const dueAt = optionalDate(req.body.dueAt);

  const meetingResult = await pool.query(
    'SELECT id FROM meetings WHERE id = $1 AND user_id = $2',
    [meetingId, req.userId]
  );
  if (!meetingResult.rows[0]) throw new HttpError(404, 'Meeting not found');

  const result = await pool.query(
    `INSERT INTO meeting_actions (meeting_id, user_id, title, due_at, source)
     VALUES ($1, $2, $3, $4, 'manual')
     RETURNING id, meeting_id, title, due_at, status, source, created_at, updated_at, completed_at`,
    [meetingId, req.userId, title, dueAt]
  );

  const row = result.rows[0];
  res.status(201).json({
    message: 'Meeting action created',
    action: mapAction(row),
  });
}));

router.patch('/actions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const actionId = Number(req.params.id);
  if (!Number.isInteger(actionId)) throw new HttpError(400, 'Valid action ID required');

  const existingResult = await pool.query(
    'SELECT * FROM meeting_actions WHERE id = $1 AND user_id = $2',
    [actionId, req.userId]
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new HttpError(404, 'Action not found');

  let title = existing.title;
  let dueAt = existing.due_at;
  let status = existing.status;

  if (Object.hasOwn(req.body, 'title')) {
    title = cleanTitle(req.body.title);
    if (!title) throw new HttpError(400, 'Action title is required');
  }
  if (Object.hasOwn(req.body, 'dueAt')) dueAt = optionalDate(req.body.dueAt);
  if (Object.hasOwn(req.body, 'status')) {
    status = String(req.body.status || '').toLowerCase();
    if (!['open', 'completed'].includes(status)) throw new HttpError(400, 'status must be open or completed');
  }

  const completedAt = status === 'completed'
    ? (existing.status === 'completed' && existing.completed_at ? existing.completed_at : new Date().toISOString())
    : null;

  const result = await pool.query(
    `UPDATE meeting_actions
     SET title = $1,
         due_at = $2,
         status = $3,
         completed_at = $4,
         updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING id, meeting_id, title, due_at, status, source, created_at, updated_at, completed_at`,
    [title, dueAt, status, completedAt, actionId, req.userId]
  );

  res.json({
    message: status === 'completed' ? 'Action completed' : 'Action updated',
    action: mapAction(result.rows[0]),
  });
}));

module.exports = router;
