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

function cleanTextArray(value, maxItems = 12, maxLength = 1000) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanActionItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      task: cleanText(item?.task, 1200),
      owner: cleanText(item?.owner, 200),
      dueAt: cleanText(item?.dueAt, 100),
    }))
    .filter((item) => item.task)
    .slice(0, 12);
}

function serializeMemory(row) {
  return {
    meetingId: row.id,
    attendeeEmail: row.attendee_email,
    attendeeName: row.attendee_name,
    meetingType: row.meeting_type || 'General meeting',
    meetingGoal: row.meeting_goal || '',
    inviteMessage: row.invite_message || '',
    qualificationQuestions: Array.isArray(row.qualification_questions) ? row.qualification_questions : [],
    guestAnswers: Array.isArray(row.guest_answers) ? row.guest_answers : [],
    internalNotes: row.internal_notes || '',
    selectedSlot: row.selected_slot,
    durationMinutes: row.duration_minutes || 60,
    happened: row.meeting_happened,
    useful: row.meeting_useful,
    outcomeNextStep: row.outcome_next_step || '',
    outcomeFollowUpAt: row.outcome_follow_up_at,
    outcomeNotes: row.outcome_notes || '',
    outcomeRecordedAt: row.outcome_recorded_at,
    notes: row.meeting_notes || '',
    summary: row.memory_summary || '',
    keyPoints: Array.isArray(row.memory_key_points) ? row.memory_key_points : [],
    decisions: Array.isArray(row.memory_decisions) ? row.memory_decisions : [],
    actionItems: Array.isArray(row.memory_action_items) ? row.memory_action_items : [],
    unansweredQuestions: Array.isArray(row.memory_unanswered_questions) ? row.memory_unanswered_questions : [],
    memoryUpdatedAt: row.memory_updated_at,
  };
}

const MEMORY_SELECT = `
  SELECT
    id,
    attendee_email,
    attendee_name,
    meeting_type,
    meeting_goal,
    invite_message,
    qualification_questions,
    guest_answers,
    internal_notes,
    selected_slot,
    duration_minutes,
    status,
    meeting_happened,
    meeting_useful,
    outcome_next_step,
    outcome_follow_up_at,
    outcome_notes,
    outcome_recorded_at,
    meeting_notes,
    memory_summary,
    memory_key_points,
    memory_decisions,
    memory_action_items,
    memory_unanswered_questions,
    memory_updated_at
  FROM meetings
`;

router.get('/meetings/memory-state', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `${MEMORY_SELECT}
     WHERE user_id = $1 AND status = 'confirmed'
     ORDER BY selected_slot DESC NULLS LAST, id DESC`,
    [req.userId]
  );

  res.json({ memories: result.rows.map(serializeMemory) });
}));

router.patch('/meetings/:id/memory', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const existing = await pool.query(
    'SELECT id, status FROM meetings WHERE id = $1 AND user_id = $2',
    [meetingId, req.userId]
  );
  const meeting = existing.rows[0];
  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }
  if (meeting.status !== 'confirmed') {
    throw new HttpError(409, 'Meeting memory is only available for booked meetings');
  }

  const notes = cleanText(req.body.notes, 20000);
  const summary = cleanText(req.body.summary, 5000);
  const keyPoints = cleanTextArray(req.body.keyPoints);
  const decisions = cleanTextArray(req.body.decisions);
  const actionItems = cleanActionItems(req.body.actionItems);
  const unansweredQuestions = cleanTextArray(req.body.unansweredQuestions);

  const result = await pool.query(
    `UPDATE meetings
     SET meeting_notes = $1,
         memory_summary = $2,
         memory_key_points = $3::jsonb,
         memory_decisions = $4::jsonb,
         memory_action_items = $5::jsonb,
         memory_unanswered_questions = $6::jsonb,
         memory_updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [
      notes,
      summary,
      JSON.stringify(keyPoints),
      JSON.stringify(decisions),
      JSON.stringify(actionItems),
      JSON.stringify(unansweredQuestions),
      meetingId,
      req.userId,
    ]
  );

  res.json({
    message: 'Meeting memory saved',
    memory: serializeMemory(result.rows[0]),
  });
}));

module.exports = router;
module.exports._test = { cleanTextArray, cleanActionItems, serializeMemory };
