const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { generateWorkflowContent } = require('../services/generationService');

const router = express.Router();
const SUPPORTED_KINDS = new Set(['meeting_brief']);

function cleanText(value, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function loadPersistedMeetingContext(meetingId, userId) {
  if (meetingId === undefined || meetingId === null || meetingId === '') {
    return null;
  }

  const id = Number(meetingId);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const result = await pool.query(
    `SELECT
      id,
      attendee_email,
      attendee_name,
      meeting_type,
      meeting_goal,
      invite_message,
      qualification_questions,
      guest_answers,
      internal_notes,
      duration_minutes,
      selected_slot,
      status
    FROM meetings
    WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  const meeting = result.rows[0];
  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }

  return {
    meetingId: meeting.id,
    attendeeEmail: meeting.attendee_email || '',
    attendeeName: meeting.attendee_name || '',
    meetingType: meeting.meeting_type || 'General meeting',
    meetingGoal: meeting.meeting_goal || '',
    inviteMessage: meeting.invite_message || '',
    qualificationQuestions: Array.isArray(meeting.qualification_questions) ? meeting.qualification_questions : [],
    guestAnswers: Array.isArray(meeting.guest_answers) ? meeting.guest_answers : [],
    internalNotes: meeting.internal_notes || '',
    durationMinutes: meeting.duration_minutes || 60,
    selectedSlot: meeting.selected_slot,
    status: meeting.status,
  };
}

router.post('/intelligence/generate', authMiddleware, asyncHandler(async (req, res) => {
  const kind = cleanText(req.body.kind, 80);
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new HttpError(400, 'Unsupported generation kind');
  }

  const context = req.body.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
    ? req.body.context
    : {};
  const prompt = cleanText(context.prompt);
  if (kind === 'meeting_brief' && !prompt) {
    throw new HttpError(400, 'Describe the meeting before generating a brief');
  }

  const persistedContext = await loadPersistedMeetingContext(req.body.meetingId, req.userId);
  const output = await generateWorkflowContent({
    kind,
    context: {
      ...context,
      prompt,
      persistedContext,
    },
  });

  res.json({ output });
}));

module.exports = router;
