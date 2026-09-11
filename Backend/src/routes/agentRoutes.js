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
} = require('../services/agentStore');
const { runAgentTurn, resumeAgentTurn } = require('../services/agentOrchestratorService');
const {
  pendingActionForPayload,
  executeStoredAgentAction,
  cancelStoredAgentAction,
  _test: actionTest,
} = require('../services/agentActionExecutionService');

const router = express.Router();

function cleanText(value, maxLength = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function assertPendingAction(action) {
  if (!action) throw new HttpError(404, 'Agent action not found');
  if (action.status !== 'pending') throw new HttpError(409, 'Agent action is no longer pending');
  if (new Date(action.expires_at).getTime() <= Date.now()) {
    throw new HttpError(409, 'This agent action expired. Ask CallSync to prepare it again.');
  }
  return action;
}

async function saveAgentResultMessage({ userId, threadId, turn }) {
  return saveMessage({
    userId,
    threadId,
    role: 'assistant',
    content: turn.text,
    payload: turn.payload || {},
  });
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
  const turn = await runAgentTurn({
    messages: history,
    message,
    userId: req.userId,
    userTimeZone,
    threadId: thread.id,
  });

  let payload = turn.payload || {};

  // The normal AI path creates the durable action inside LangGraph before interrupting.
  // The deterministic fallback still creates a legacy pending action here so provider
  // outages do not remove scheduling capability.
  if (!turn.interrupted) {
    const pendingSpec = pendingActionForPayload(payload);
    if (pendingSpec) {
      const pending = await createPendingAction({
        userId: req.userId,
        threadId: thread.id,
        actionType: pendingSpec.actionType,
        payload: { ...pendingSpec.payload, __graphManaged: false },
      });
      payload = { ...payload, actionId: pending.id, expiresAt: pending.expires_at };
    }
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
  const action = assertPendingAction(await getPendingAction(req.userId, req.params.id));

  if (action.payload?.__graphManaged) {
    const turn = await resumeAgentTurn({
      threadId: action.thread_id,
      userId: req.userId,
      actionId: action.id,
      approved: true,
      body: req.body || {},
    });
    const message = await saveAgentResultMessage({
      userId: req.userId,
      threadId: action.thread_id,
      turn,
    });
    res.json({ actionId: action.id, result: turn.result, message });
    return;
  }

  const completed = await executeStoredAgentAction({
    userId: req.userId,
    actionId: action.id,
    body: req.body || {},
  });
  const message = await saveAgentResultMessage({
    userId: req.userId,
    threadId: action.thread_id,
    turn: {
      text: completed.execution.content,
      payload: completed.execution.payload,
    },
  });
  res.json({ actionId: action.id, result: completed.execution.result, message });
}));

router.post('/agent/actions/:id/reject', authMiddleware, asyncHandler(async (req, res) => {
  const action = assertPendingAction(await getPendingAction(req.userId, req.params.id));

  if (action.payload?.__graphManaged) {
    const turn = await resumeAgentTurn({
      threadId: action.thread_id,
      userId: req.userId,
      actionId: action.id,
      approved: false,
      body: {},
    });
    const message = await saveAgentResultMessage({
      userId: req.userId,
      threadId: action.thread_id,
      turn,
    });
    res.json({ actionId: action.id, result: turn.result, message });
    return;
  }

  await cancelStoredAgentAction({ userId: req.userId, actionId: action.id });
  const message = await saveMessage({
    userId: req.userId,
    threadId: action.thread_id,
    role: 'assistant',
    content: 'Okay. I did not make that external change.',
    payload: { type: 'action_cancelled', actionId: action.id, completed: true },
  });
  res.json({ actionId: action.id, result: { cancelled: true }, message });
}));

module.exports = router;
module.exports._test = {
  ...actionTest,
  assertPendingAction,
};
