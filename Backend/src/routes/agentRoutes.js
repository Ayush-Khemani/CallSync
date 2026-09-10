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
const { sendFollowUp } = require('../services/followUpService');
const { cancelMeeting, rescheduleMeeting } = require('../services/meetingLifecycleService');

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

function validateSelectedSlot(selectedSlot, offeredSlots) {
  if (!selectedSlot || Number.isNaN(new Date(selectedSlot).getTime())) {
    throw new HttpError(400, 'Choose a valid proposed meeting time');
  }
  if (!Array.isArray(offeredSlots) || !offeredSlots.includes(selectedSlot)) {
    throw new HttpError(400, 'Selected time must come from the agent proposal');
  }
  return selectedSlot;
}

function pendingActionForPayload(payload) {
  if (!payload?.proposal) return null;
  if (payload.type === 'schedule_confirmation') {
    return { actionType: 'create_meeting', payload: actionPayloadFromProposal(payload.proposal) };
  }
  if (payload.type === 'follow_up_confirmation') {
    return { actionType: 'send_follow_up', payload: payload.proposal };
  }
  if (payload.type === 'cancel_confirmation') {
    return { actionType: 'cancel_meeting', payload: payload.proposal };
  }
  if (payload.type === 'reschedule_confirmation') {
    return { actionType: 'reschedule_meeting', payload: payload.proposal };
  }
  return null;
}

function assertAllowedProvider(provider, availableProviders) {
  if (!['google', 'outlook'].includes(provider)) throw new HttpError(400, 'Choose a valid sending mailbox');
  if (!Array.isArray(availableProviders) || !availableProviders.includes(provider)) {
    throw new HttpError(400, 'Sending mailbox must come from the original agent proposal');
  }
  return provider;
}

async function executePendingAction({ action, userId, body = {} }) {
  const stored = action.payload || {};

  if (action.action_type === 'create_meeting') {
    const selectedSlots = validateSelectedSlots(body.selectedSlots || stored.slots, stored.offeredSlots);
    const result = await createMeetingRequest({
      userId,
      payload: {
        attendeeEmail: stored.attendeeEmail,
        attendeeName: stored.attendeeName,
        durationMinutes: stored.durationMinutes,
        slots: selectedSlots,
        brief: stored.brief || {},
      },
    });
    const sent = Boolean(result.delivery?.requestEmail?.sent);
    return {
      result,
      content: sent
        ? `Done. I created the meeting with ${stored.attendeeName}, protected the offered times, and sent the request.`
        : `The meeting with ${stored.attendeeName} is created and the offered times are protected, but email delivery was not confirmed.`,
      payload: {
        type: 'created', actionId: action.id, completed: true,
        meetingId: result.meetingId, meetingName: stored.attendeeName,
        uniqueLink: result.uniqueLink, sent,
      },
    };
  }

  if (action.action_type === 'send_follow_up') {
    const provider = assertAllowedProvider(body.provider || stored.provider, stored.availableProviders);
    const message = cleanText(body.message, 20000) || stored.message;
    const subject = cleanText(body.subject, 500) || stored.subject;
    const result = await sendFollowUp({
      userId,
      meetingId: stored.meetingId,
      provider,
      message,
      subject,
      nextFollowUpAt: body.nextFollowUpAt || stored.nextFollowUpAt || null,
    });
    return {
      result,
      content: `Done. I sent the follow-up to ${result.attendeeName} through ${provider === 'google' ? 'Gmail' : 'Outlook'}.`,
      payload: {
        type: 'follow_up_sent', actionId: action.id, completed: true,
        meetingId: stored.meetingId, attendeeName: result.attendeeName,
        provider, sent: true,
      },
    };
  }

  if (action.action_type === 'cancel_meeting') {
    const result = await cancelMeeting({ userId, meetingId: stored.meetingId });
    const cleanupComplete = Boolean(result.delivery?.calendarCleanupComplete);
    return {
      result,
      content: cleanupComplete
        ? `Done. I cancelled the meeting with ${result.attendeeName} and cleaned up the connected calendar event.`
        : `I cancelled the CallSync meeting with ${result.attendeeName}, but calendar cleanup was not complete. Check the connected calendar before assuming the event disappeared everywhere.`,
      payload: {
        type: 'cancelled', actionId: action.id, completed: true,
        meetingId: result.meetingId, attendeeName: result.attendeeName,
        cleanupComplete,
      },
    };
  }

  if (action.action_type === 'reschedule_meeting') {
    const selectedSlot = validateSelectedSlot(body.selectedSlot || stored.selectedSlot, stored.slots);
    const result = await rescheduleMeeting({ userId, meetingId: stored.meetingId, newSlot: selectedSlot });
    return {
      result,
      content: `Done. I moved the meeting with ${result.attendeeName} to the new time and updated the connected calendar event.`,
      payload: {
        type: 'rescheduled', actionId: action.id, completed: true,
        meetingId: result.meetingId, attendeeName: result.attendeeName,
        previousSlot: result.previousSlot, selectedSlot: result.selectedSlot,
      },
    };
  }

  throw new HttpError(400, 'Unsupported agent action');
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
  await saveMessage({ userId: req.userId, threadId: thread.id, role: 'user', content: message });

  const history = await listMessages(req.userId, thread.id, 30);
  const turn = await runAgentTurn({ messages: history, message, userId: req.userId, userTimeZone });

  let payload = turn.payload || {};
  const pendingSpec = pendingActionForPayload(payload);
  if (pendingSpec) {
    const pending = await createPendingAction({
      userId: req.userId,
      threadId: thread.id,
      actionType: pendingSpec.actionType,
      payload: pendingSpec.payload,
    });
    payload = { ...payload, actionId: pending.id, expiresAt: pending.expires_at };
  }

  const assistantMessage = await saveMessage({
    userId: req.userId,
    threadId: thread.id,
    role: 'assistant',
    content: turn.text,
    payload,
  });

  res.json({ thread: { id: thread.id, title: thread.title }, message: assistantMessage });
}));

router.post('/agent/actions/:id/confirm', authMiddleware, asyncHandler(async (req, res) => {
  const action = await getPendingAction(req.userId, req.params.id);
  if (!action) throw new HttpError(404, 'Agent action not found');
  if (action.status !== 'pending') throw new HttpError(409, 'Agent action is no longer pending');

  if (new Date(action.expires_at).getTime() <= Date.now()) {
    await markAction({ userId: req.userId, actionId: action.id, status: 'expired' });
    throw new HttpError(409, 'This agent action expired. Ask CallSync to prepare it again.');
  }

  try {
    const execution = await executePendingAction({ action, userId: req.userId, body: req.body || {} });
    await markAction({ userId: req.userId, actionId: action.id, status: 'confirmed', result: execution.result });

    const message = await saveMessage({
      userId: req.userId,
      threadId: action.thread_id,
      role: 'assistant',
      content: execution.content,
      payload: execution.payload,
    });

    res.json({ actionId: action.id, result: execution.result, message });
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
module.exports._test = {
  actionPayloadFromProposal,
  validateSelectedSlots,
  validateSelectedSlot,
  pendingActionForPayload,
  assertAllowedProvider,
};
