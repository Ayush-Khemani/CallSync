const express = require('express');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const {
  getOrCreateThread,
  latestThread,
  listMessages,
  saveMessage,
  createPendingAction,
  getPendingAction,
  markAction,
} = require('../services/agentStore');
const { runAgentTurn } = require('../services/agentOrchestratorService');
const { createMeetingRequest } = require('../services/meetingCreationService');

const router = express.Router();

function cleanText(value, maxLength = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function actionPayloadFromProposal(proposal) {
  return {
    attendeeEmail: proposal.attendeeEmail,
    attendeeName: proposal.attendeeName,
    durationMinutes: proposal.durationMinutes,
    slots: proposal.selectedSlots,
    offeredSlots: proposal.slots,
    timeZone: proposal.timeZone,
    date: proposal.date,
    brief: {
      type: proposal.brief?.type || 'Meeting',
      goal: proposal.brief?.goal || '',
      message: proposal.brief?.message || '',
      questions: Array.isArray(proposal.brief?.questions) ? proposal.brief.questions : [],
      internalNotes: '',
    },
  };
}

function validateSelectedSlots(selectedSlots, offeredSlots) {
  if (!Array.isArray(selectedSlots) || !selectedSlots.length) {
    throw new HttpError(400, 'Select at least one offered time');
  }
  const offered = new Set(Array.isArray(offeredSlots) ? offeredSlots : []);
  const unique = [...new Set(selectedSlots)];
  if (unique.some((slot) => !offered.has(slot))) {
    throw new HttpError(400, 'Selected times must come from the agent proposal');
  }
  if (unique.some((slot) => Number.isNaN(new Date(slot).getTime()))) {
    throw new HttpError(400, 'Selected times must be valid dates');
  }
  return unique;
}

router.get('/agent/threads/latest', authMiddleware, asyncHandler(async (req, res) => {
  const thread = await latestThread(req.userId);
  if (!thread) {
    res.json({ thread: null, messages: [] });
    return;
  }
  const messages = await listMessages(req.userId, thread.id, 60);
  res.json({ thread, messages });
}));

router.get('/agent/threads/:id/messages', authMiddleware, asyncHandler(async (req, res) => {
  const thread = await getOrCreateThread(req.userId, req.params.id);
  const messages = await listMessages(req.userId, thread.id, 100);
  res.json({ thread, messages });
}));

router.post('/agent/chat', authMiddleware, asyncHandler(async (req, res) => {
  const message = cleanText(req.body.message, 10000);
  if (!message) throw new HttpError(400, 'Message required');

  const userTimeZone = cleanText(req.body.timeZone, 120) || 'UTC';
  const thread = await getOrCreateThread(req.userId, req.body.threadId, message);
  await saveMessage({
    userId: req.userId,
    threadId: thread.id,
    role: 'user',
    content: message,
  });

  const history = await listMessages(req.userId, thread.id, 30);
  const turn = await runAgentTurn({
    messages: history,
    message,
    userId: req.userId,
    userTimeZone,
  });

  let payload = turn.payload || {};
  if (payload.type === 'schedule_confirmation' && payload.proposal) {
    const pending = await createPendingAction({
      userId: req.userId,
      threadId: thread.id,
      actionType: 'create_meeting',
      payload: actionPayloadFromProposal(payload.proposal),
    });
    payload = {
      ...payload,
      actionId: pending.id,
      expiresAt: pending.expires_at,
    };
  }

  const assistantMessage = await saveMessage({
    userId: req.userId,
    threadId: thread.id,
    role: 'assistant',
    content: turn.text,
    payload,
  });

  res.json({
    thread: { id: thread.id, title: thread.title },
    message: assistantMessage,
  });
}));

router.post('/agent/actions/:id/confirm', authMiddleware, asyncHandler(async (req, res) => {
  const action = await getPendingAction(req.userId, req.params.id);
  if (!action) throw new HttpError(404, 'Agent action not found');
  if (action.status !== 'pending') throw new HttpError(409, 'Agent action is no longer pending');

  if (new Date(action.expires_at).getTime() <= Date.now()) {
    await markAction({ userId: req.userId, actionId: action.id, status: 'expired' });
    throw new HttpError(409, 'This agent action expired. Ask CallSync to prepare it again.');
  }

  if (action.action_type !== 'create_meeting') {
    throw new HttpError(400, 'Unsupported agent action');
  }

  const stored = action.payload || {};
  const selectedSlots = validateSelectedSlots(
    req.body.selectedSlots || stored.slots,
    stored.offeredSlots
  );
  const meetingPayload = {
    attendeeEmail: stored.attendeeEmail,
    attendeeName: stored.attendeeName,
    durationMinutes: stored.durationMinutes,
    slots: selectedSlots,
    brief: stored.brief || {},
  };

  try {
    const result = await createMeetingRequest({
      userId: req.userId,
      payload: meetingPayload,
    });
    await markAction({
      userId: req.userId,
      actionId: action.id,
      status: 'confirmed',
      result,
    });

    const sent = Boolean(result.delivery?.requestEmail?.sent);
    const content = sent
      ? `Done. I created the meeting with ${stored.attendeeName}, protected the offered times, and sent the request.`
      : `The meeting with ${stored.attendeeName} is created and the offered times are protected, but email delivery was not confirmed.`;

    const message = await saveMessage({
      userId: req.userId,
      threadId: action.thread_id,
      role: 'assistant',
      content,
      payload: {
        type: 'created',
        actionId: action.id,
        meetingId: result.meetingId,
        meetingName: stored.attendeeName,
        uniqueLink: result.uniqueLink,
        sent,
      },
    });

    res.json({ actionId: action.id, result, message });
  } catch (error) {
    await markAction({
      userId: req.userId,
      actionId: action.id,
      status: 'failed',
      result: { error: error.message || 'Action failed' },
    });
    throw error;
  }
}));

module.exports = router;
module.exports._test = { actionPayloadFromProposal, validateSelectedSlots };
