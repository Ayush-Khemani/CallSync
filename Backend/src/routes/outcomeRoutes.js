const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const router = express.Router();

function cleanText(value, maxLength = 10000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function optionalBoolean(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'boolean') throw new HttpError(400, `${fieldName} must be true, false, or null`);
  return value;
}

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'followUpAt must be a valid date');
  return date.toISOString();
}

router.get('/meetings/outcome-state', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
      id,
      meeting_happened,
      meeting_useful,
      outcome_next_step,
      outcome_follow_up_at,
      outcome_notes,
      outcome_recorded_at
    FROM meetings
    WHERE user_id = $1`,
    [req.userId]
  );

  res.json({
    outcomes: result.rows.map((row) => ({
      meetingId: row.id,
      happened: row.meeting_happened,
      useful: row.meeting_useful,
      nextStep: row.outcome_next_step || '',
      followUpAt: row.outcome_follow_up_at,
      notes: row.outcome_notes || '',
      recordedAt: row.outcome_recorded_at,
    })),
  });
}));

router.patch('/meetings/:id/outcome', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) throw new HttpError(400, 'Valid meeting ID required');

  const happened = optionalBoolean(req.body.happened, 'happened');
  const useful = optionalBoolean(req.body.useful, 'useful');
  const nextStep = cleanText(req.body.nextStep, 5000);
  const followUpAt = optionalDate(req.body.followUpAt);
  const notes = cleanText(req.body.notes, 10000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const meetingResult = await client.query(
      'SELECT id, status FROM meetings WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [meetingId, req.userId]
    );
    const meeting = meetingResult.rows[0];
    if (!meeting) throw new HttpError(404, 'Meeting not found');
    if (meeting.status !== 'confirmed') throw new HttpError(409, 'Outcomes can only be recorded for booked meetings');

    const result = await client.query(
      `UPDATE meetings
       SET meeting_happened = $1,
           meeting_useful = $2,
           outcome_next_step = $3,
           outcome_follow_up_at = $4,
           outcome_notes = $5,
           outcome_recorded_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING id, meeting_happened, meeting_useful, outcome_next_step, outcome_follow_up_at, outcome_notes, outcome_recorded_at`,
      [happened, useful, nextStep, followUpAt, notes, meetingId, req.userId]
    );

    if (nextStep) {
      await client.query(
        `INSERT INTO meeting_actions (meeting_id, user_id, title, due_at, source)
         VALUES ($1, $2, $3, $4, 'outcome')
         ON CONFLICT (meeting_id, source) WHERE source = 'outcome'
         DO UPDATE SET
           title = EXCLUDED.title,
           due_at = EXCLUDED.due_at,
           status = CASE
             WHEN meeting_actions.title IS DISTINCT FROM EXCLUDED.title
               OR meeting_actions.due_at IS DISTINCT FROM EXCLUDED.due_at
             THEN 'open'
             ELSE meeting_actions.status
           END,
           completed_at = CASE
             WHEN meeting_actions.title IS DISTINCT FROM EXCLUDED.title
               OR meeting_actions.due_at IS DISTINCT FROM EXCLUDED.due_at
             THEN NULL
             ELSE meeting_actions.completed_at
           END,
           updated_at = NOW()`,
        [meetingId, req.userId, nextStep, followUpAt]
      );
    } else {
      await client.query(
        `DELETE FROM meeting_actions
         WHERE meeting_id = $1 AND user_id = $2 AND source = 'outcome'`,
        [meetingId, req.userId]
      );
    }

    await client.query('COMMIT');

    const row = result.rows[0];
    res.json({
      message: 'Meeting outcome saved',
      outcome: {
        meetingId: row.id,
        happened: row.meeting_happened,
        useful: row.meeting_useful,
        nextStep: row.outcome_next_step || '',
        followUpAt: row.outcome_follow_up_at,
        notes: row.outcome_notes || '',
        recordedAt: row.outcome_recorded_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
