const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { generateWorkflowContent } = require('../services/generationService');
const { generateWorkflowArtifact } = require('../services/workflowGenerationService');
const { generateMeetingMemory } = require('../services/memoryGenerationService');

const router = express.Router();
const SUPPORTED_KINDS = new Set(['meeting_brief', 'follow_up', 'pre_call', 'next_step', 'meeting_memory']);

function cleanText(value, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

async function loadPreviousMeetingMemory(meeting, userId) {
  if (!meeting?.attendee_email || meeting.status !== 'confirmed') return null;

  const result = await pool.query(
    `SELECT
      id,
      selected_slot,
      memory_summary,
      memory_key_points,
      memory_decisions,
      outcome_next_step,
      memory_updated_at
     FROM meetings
     WHERE user_id = $1
       AND attendee_email = $2
       AND status = 'confirmed'
       AND id <> $3
       AND ($4::timestamptz IS NULL OR COALESCE(selected_slot, created_at) < $4::timestamptz)
       AND (
         COALESCE(memory_summary, '') <> ''
         OR COALESCE(outcome_next_step, '') <> ''
         OR jsonb_array_length(COALESCE(memory_key_points, '[]'::jsonb)) > 0
       )
     ORDER BY COALESCE(selected_slot, created_at) DESC, id DESC
     LIMIT 1`,
    [userId, meeting.attendee_email, meeting.id, meeting.selected_slot]
  );

  const previous = result.rows[0];
  if (!previous) return null;

  return {
    meetingId: previous.id,
    selectedSlot: previous.selected_slot,
    summary: previous.memory_summary || '',
    keyPoints: Array.isArray(previous.memory_key_points) ? previous.memory_key_points : [],
    decisions: Array.isArray(previous.memory_decisions) ? previous.memory_decisions : [],
    nextStep: previous.outcome_next_step || '',
    memoryUpdatedAt: previous.memory_updated_at,
  };
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
      status,
      created_at,
      last_followed_up_at,
      follow_up_count,
      next_follow_up_at,
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
    WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  const meeting = result.rows[0];
  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }

  const previousMeetingMemory = await loadPreviousMeetingMemory(meeting, userId);

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
    createdAt: meeting.created_at,
    lastFollowedUpAt: meeting.last_followed_up_at,
    followUpCount: Number(meeting.follow_up_count || 0),
    nextFollowUpAt: meeting.next_follow_up_at,
    happened: meeting.meeting_happened,
    useful: meeting.meeting_useful,
    outcomeNextStep: meeting.outcome_next_step || '',
    outcomeFollowUpAt: meeting.outcome_follow_up_at,
    outcomeNotes: meeting.outcome_notes || '',
    outcomeRecordedAt: meeting.outcome_recorded_at,
    notes: meeting.meeting_notes || '',
    memorySummary: meeting.memory_summary || '',
    memoryKeyPoints: Array.isArray(meeting.memory_key_points) ? meeting.memory_key_points : [],
    memoryDecisions: Array.isArray(meeting.memory_decisions) ? meeting.memory_decisions : [],
    memoryActionItems: Array.isArray(meeting.memory_action_items) ? meeting.memory_action_items : [],
    memoryUnansweredQuestions: Array.isArray(meeting.memory_unanswered_questions) ? meeting.memory_unanswered_questions : [],
    memoryUpdatedAt: meeting.memory_updated_at,
    previousMeetingMemory,
  };
}

function validateMeetingState(kind, meeting) {
  if (kind === 'meeting_brief') return;
  if (!meeting) throw new HttpError(400, 'Meeting ID required for this generation kind');
  if (kind === 'follow_up' && meeting.status !== 'pending') {
    throw new HttpError(409, 'Follow-up suggestions are only available for pending meeting requests');
  }
  if (['pre_call', 'next_step', 'meeting_memory'].includes(kind) && meeting.status !== 'confirmed') {
    throw new HttpError(409, 'This suggestion is only available for booked meetings');
  }
}

function editableContextFor(kind, rawContext) {
  if (kind === 'meeting_brief') {
    return { prompt: cleanText(rawContext.prompt) };
  }
  if (kind === 'follow_up') {
    return { bookingUrl: cleanText(rawContext.bookingUrl, 1000) };
  }
  if (kind === 'pre_call') {
    return {};
  }
  if (kind === 'next_step') {
    return {
      happened: optionalBoolean(rawContext.happened),
      useful: optionalBoolean(rawContext.useful),
      nextStep: cleanText(rawContext.nextStep, 2000),
      notes: cleanText(rawContext.notes, 4000),
    };
  }
  if (kind === 'meeting_memory') {
    return { notes: cleanText(rawContext.notes, 20000) };
  }
  return {};
}

router.post('/intelligence/generate', authMiddleware, asyncHandler(async (req, res) => {
  const kind = cleanText(req.body.kind, 80);
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new HttpError(400, 'Unsupported generation kind');
  }

  const rawContext = req.body.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
    ? req.body.context
    : {};
  const editableContext = editableContextFor(kind, rawContext);
  if (kind === 'meeting_brief' && !editableContext.prompt) {
    throw new HttpError(400, 'Describe the meeting before generating a brief');
  }

  const persistedContext = await loadPersistedMeetingContext(req.body.meetingId, req.userId);
  validateMeetingState(kind, persistedContext);

  if (kind === 'meeting_memory' && !(editableContext.notes || persistedContext?.notes)) {
    throw new HttpError(400, 'Capture meeting notes before generating memory');
  }

  const context = { ...editableContext, persistedContext };
  let output;
  if (kind === 'meeting_brief') {
    output = await generateWorkflowContent({ kind, context });
  } else if (kind === 'meeting_memory') {
    output = await generateMeetingMemory({
      ...context,
      notes: editableContext.notes || persistedContext.notes,
    });
  } else {
    output = await generateWorkflowArtifact({ kind, context });
  }

  res.json({ output });
}));

module.exports = router;
module.exports._test = { editableContextFor, validateMeetingState };
