const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const router = express.Router();

function parseOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'nextFollowUpAt must be a valid date');
  }
  return date.toISOString();
}

router.get('/meetings/follow-up-state', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
      id,
      last_followed_up_at,
      follow_up_count,
      next_follow_up_at
    FROM meetings
    WHERE user_id = $1`,
    [req.userId]
  );

  res.json({
    followUps: result.rows.map((row) => ({
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
    })),
  });
}));

router.patch('/meetings/:id/follow-up', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const meetingResult = await pool.query(
    'SELECT id, status FROM meetings WHERE id = $1 AND user_id = $2',
    [meetingId, req.userId]
  );
  const meeting = meetingResult.rows[0];

  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }
  if (meeting.status !== 'pending') {
    throw new HttpError(409, 'Only pending meeting requests can be marked as followed up');
  }

  const nextFollowUpAt = parseOptionalDate(req.body.nextFollowUpAt);
  const result = await pool.query(
    `UPDATE meetings
     SET last_followed_up_at = NOW(),
         follow_up_count = follow_up_count + 1,
         next_follow_up_at = COALESCE($1::timestamptz, NOW() + INTERVAL '3 days')
     WHERE id = $2 AND user_id = $3
     RETURNING id, last_followed_up_at, follow_up_count, next_follow_up_at`,
    [nextFollowUpAt, meetingId, req.userId]
  );

  const row = result.rows[0];
  res.json({
    message: 'Follow-up recorded',
    followUp: {
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
    },
  });
}));

module.exports = router;
