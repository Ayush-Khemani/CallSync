const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { deriveLifecycleMetrics } = require('../services/analyticsService');

const router = express.Router();

const METRICS_SQL = `
  SELECT
    COUNT(*)::int AS total_created,
    COUNT(*) FILTER (WHERE status = 'confirmed')::int AS booked,
    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
    COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
    COUNT(*) FILTER (WHERE follow_up_count > 0)::int AS followed_up,
    COUNT(*) FILTER (WHERE outcome_recorded_at IS NOT NULL)::int AS outcomes_recorded,
    COUNT(*) FILTER (WHERE meeting_useful IS NOT NULL)::int AS outcomes_rated,
    COUNT(*) FILTER (WHERE meeting_useful = TRUE)::int AS useful_meetings,
    COUNT(*) FILTER (
      WHERE status = 'pending'
        AND COALESCE(next_follow_up_at, created_at + INTERVAL '2 days') <= NOW()
    )::int AS follow_up_due
  FROM meetings
  WHERE user_id = $1
    AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
`;

router.get('/analytics/meeting-lifecycle', authMiddleware, asyncHandler(async (req, res) => {
  const last30Start = new Date(Date.now() - 30 * 86400000).toISOString();
  const [allTimeResult, last30Result] = await Promise.all([
    pool.query(METRICS_SQL, [req.userId, null]),
    pool.query(METRICS_SQL, [req.userId, last30Start]),
  ]);

  res.json({
    allTime: deriveLifecycleMetrics(allTimeResult.rows[0]),
    last30Days: deriveLifecycleMetrics(last30Result.rows[0]),
    definitions: {
      bookingRate: 'Booked meetings divided by meeting requests created.',
      followUpTouchedRate: 'Meeting requests with at least one recorded follow-up divided by meeting requests created.',
      outcomeCaptureRate: 'Booked meetings with a recorded outcome divided by booked meetings.',
      usefulWhenRatedRate: 'Meetings marked useful divided by meetings with a usefulness rating.',
    },
  });
}));

module.exports = router;
