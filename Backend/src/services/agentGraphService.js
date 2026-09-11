const axios = require('axios');
const { StateGraph, StateSchema, START, END, interrupt, Command } = require('@langchain/langgraph');
const z = require('zod');
const HttpError = require('../utils/httpError');
const config = require('../config/env');
const { CALLSYNC_AGENT_TOOLS, executeAgentTool } = require('./agentRegistry');
const { getAgentCheckpointer, graphThreadConfig } = require('./agentCheckpointService');
const {
  requiresApprovalPayload,
  prepareGraphApproval,
  executeStoredAgentAction,
  cancelStoredAgentAction,
} = require('./agentActionExecutionService');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_TOOL_ROUNDS = 6;
const GRAPH_RECURSION_LIMIT = (MAX_TOOL_ROUNDS * 2) + 8;
const REQUEST_TIMEOUT_MS = 18000;

const INSTRUCTIONS = [
  'You are CallSync, an action-oriented meeting operations agent.',
  'Use tools whenever the user asks about their meetings, tasks, people, meeting history, preparation, scheduling, follow-up, cancellation, or rescheduling.',
  'Never invent meeting records, people, availability, tasks, dates, commitments, messages, or completed actions.',
  'Identify the exact meeting or task before acting. Use list_meetings, list_open_tasks, or find_person when the target is ambiguous.',
  'For a new scheduling request, call prepare_schedule using the full user request and supplied timezone.',
  'For follow-up, first identify the pending meeting, then call prepare_follow_up. The returned message requires user confirmation before it can be sent.',
  'For cancellation, first identify the meeting, then call prepare_cancellation. Cancellation requires user confirmation.',
  'For rescheduling, first identify the booked meeting, then call prepare_reschedule using the full requested new timing and supplied timezone. The returned new time requires user confirmation.',
  'For task completion or reopening, first identify the correct task using list_open_tasks when necessary, then call update_task_status. Task status is internal CallSync state and can be updated directly.',
  'If a preparation tool reports missing information or no availability, ask only for the missing or next useful input.',
  'Only prepare one external side-effect approval at a time. Do not prepare multiple unrelated sends/cancellations/reschedules in one turn.',
  'Never claim that an email, calendar update, meeting, cancellation, reschedule, or external change happened unless an execution result explicitly says it happened.',
  'When asked to prepare for a meeting, first identify the meeting using list_meetings, then call prepare_for_meeting with the correct meeting ID.',
  'Keep replies concise and operational. Prefer the next useful action over explaining CallSync features.',
].join(' ');

const AgentGraphState = new StateSchema({
  providerInput: z.array(z.any()).default([]),
  userId: z.number(),
  userTimeZone: z.string().default('UTC'),
  threadId: z.string().default(''),
  round: z.number().int().nonnegative().default(0),
  toolCalls: z.array(z.any()).default([]),
  latestPayload: z.any().nullable().default(null),
  responseText: z.string().default(''),
  stopReason: z.string().default(''),
  approval: z.any().nullable().default(null),
  approvalDecision: z.any().nullable().default(null),
  actionResult: z.any().nullable().default(null),
});

function cleanText(value, maxLength = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const texts = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') texts.push(content.text);
    }
  }
  return texts.join('\n').trim();
}

function parseArguments(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function uiPayloadForTool(name, result) {
  if (name === 'list_meetings') return { type: 'meetings', items: result.meetings || [] };
  if (name === 'list_open_tasks') return { type: 'tasks', items: result.tasks || [] };
  if (name === 'find_person') return { type: 'person', ...result };
  if (name === 'prepare_for_meeting') return { type: 'pre_call', ...result };
  if (name === 'prepare_schedule' && result.status === 'ready') return { type: 'schedule_confirmation', proposal: result.proposal };
  if (name === 'prepare_follow_up' && result.status === 'ready') return { type: 'follow_up_confirmation', proposal: result.proposal };
  if (name === 'prepare_cancellation' && result.status === 'ready') return { type: 'cancel_confirmation', proposal: result.proposal };
  if (name === 'prepare_reschedule' && result.status === 'ready') return { type: 'reschedule_confirmation', proposal: result.proposal };
  if (name === 'update_task_status' && result.action) return { type: 'task_update', action: result.action, message: result.message };
  return null;
}

function shouldClearPayload(name, result) {
  return ['prepare_schedule', 'prepare_follow_up', 'prepare_cancellation', 'prepare_reschedule'].includes(name)
    && result?.status
    && result.status !== 'ready';
}

function inputFromHistory(messages) {
  return messages.slice(-24).map((message) => ({
    role: message.role,
    content: cleanText(message.content, 10000),
  }));
}

function normalizeApprovalDecision(value, expectedActionId) {
  const decision = typeof value === 'boolean' ? { approved: value } : (value || {});
  if (decision.actionId && decision.actionId !== expectedActionId) {
    throw new HttpError(409, 'Approval does not match the paused agent action');
  }
  return {
    approved: decision.approved === true,
    actionId: expectedActionId,
    body: decision.body && typeof decision.body === 'object' && !Array.isArray(decision.body)
      ? decision.body
      : {},
  };
}

function extractInterrupt(result) {
  const first = Array.isArray(result?.__interrupt__) ? result.__interrupt__[0] : null;
  return first?.value || null;
}

async function defaultProviderCall(state) {
  return axios.post(OPENAI_RESPONSES_URL, {
    model: config.openaiModel,
    store: false,
    instructions: `${INSTRUCTIONS} Runtime timezone: ${state.userTimeZone || 'UTC'}.`,
    input: state.providerInput,
    tools: CALLSYNC_AGENT_TOOLS,
    tool_choice: 'auto',
    parallel_tool_calls: false,
    max_output_tokens: 1200,
  }, {
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function createAgentGraph({
  providerCall = defaultProviderCall,
  toolExecutor = executeAgentTool,
  approvalPreparer = prepareGraphApproval,
  actionExecutor = executeStoredAgentAction,
  actionCanceller = cancelStoredAgentAction,
  checkpointer = null,
} = {}) {
  async function modelNode(state) {
    if (state.round >= MAX_TOOL_ROUNDS) {
      return {
        responseText: 'I reached the safe tool limit for this request. Try narrowing the request to one meeting or one action.',
        toolCalls: [],
        stopReason: 'tool_limit',
      };
    }

    const response = await providerCall(state);
    const data = response?.data || response || {};
    const calls = (data.output || []).filter((item) => item.type === 'function_call');

    if (!calls.length) {
      return {
        responseText: extractResponseText(data) || 'I completed the check.',
        toolCalls: [],
        stopReason: 'complete',
      };
    }

    return {
      toolCalls: calls,
      responseText: '',
      round: state.round + 1,
      stopReason: '',
    };
  }

  async function toolsNode(state) {
    const outputs = [];
    let latestPayload = state.latestPayload;

    for (const call of state.toolCalls) {
      const args = parseArguments(call.arguments);
      if (['prepare_schedule', 'prepare_reschedule'].includes(call.name) && !args.timeZone) {
        args.timeZone = state.userTimeZone || 'UTC';
      }

      const result = await toolExecutor({ name: call.name, args, userId: state.userId });
      const nextPayload = uiPayloadForTool(call.name, result);
      if (nextPayload) latestPayload = nextPayload;
      else if (shouldClearPayload(call.name, result)) latestPayload = null;

      outputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    return {
      providerInput: [...state.providerInput, ...state.toolCalls, ...outputs],
      latestPayload,
      toolCalls: [],
    };
  }

  async function prepareApprovalNode(state) {
    const approval = await approvalPreparer({
      userId: state.userId,
      threadId: state.threadId,
      payload: state.latestPayload,
    });
    if (!approval) {
      return { stopReason: 'complete' };
    }
    return {
      approval,
      latestPayload: approval.payload,
    };
  }

  function approvalNode(state) {
    if (!state.approval?.actionId) {
      throw new HttpError(409, 'No durable approval is attached to this graph state');
    }

    const value = interrupt({
      type: 'agent_action_approval',
      actionId: state.approval.actionId,
      actionType: state.approval.actionType,
      expiresAt: state.approval.expiresAt,
      payload: state.approval.payload,
    });

    return {
      approvalDecision: normalizeApprovalDecision(value, state.approval.actionId),
    };
  }

  async function executeApprovalNode(state) {
    const completed = await actionExecutor({
      userId: state.userId,
      actionId: state.approval.actionId,
      body: state.approvalDecision?.body || {},
    });

    return {
      responseText: completed.execution.content,
      latestPayload: completed.execution.payload,
      actionResult: completed.execution.result,
      approval: null,
      approvalDecision: null,
      stopReason: 'complete',
    };
  }

  async function declineApprovalNode(state) {
    await actionCanceller({ userId: state.userId, actionId: state.approval.actionId });
    return {
      responseText: 'Okay. I did not make that external change.',
      latestPayload: {
        type: 'action_cancelled',
        actionId: state.approval.actionId,
        completed: true,
      },
      actionResult: { cancelled: true },
      approval: null,
      approvalDecision: null,
      stopReason: 'complete',
    };
  }

  function routeAfterModel(state) {
    if (state.toolCalls.length) return 'tools';
    if (state.responseText && requiresApprovalPayload(state.latestPayload)) return 'prepare_approval';
    return END;
  }

  function routeAfterApproval(state) {
    return state.approvalDecision?.approved ? 'execute_approval' : 'decline_approval';
  }

  const builder = new StateGraph(AgentGraphState)
    .addNode('model', modelNode)
    .addNode('tools', toolsNode)
    .addNode('prepare_approval', prepareApprovalNode)
    .addNode('await_approval', approvalNode)
    .addNode('execute_approval', executeApprovalNode)
    .addNode('decline_approval', declineApprovalNode)
    .addEdge(START, 'model')
    .addConditionalEdges('model', routeAfterModel, ['tools', 'prepare_approval', END])
    .addEdge('tools', 'model')
    .addEdge('prepare_approval', 'await_approval')
    .addConditionalEdges('await_approval', routeAfterApproval, ['execute_approval', 'decline_approval'])
    .addEdge('execute_approval', END)
    .addEdge('decline_approval', END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
}

let checkpointedGraphPromise;

async function getCheckpointedGraph() {
  if (!checkpointedGraphPromise) {
    checkpointedGraphPromise = getAgentCheckpointer()
      .then((checkpointer) => createAgentGraph({ checkpointer }))
      .catch((error) => {
        checkpointedGraphPromise = null;
        throw error;
      });
  }
  return checkpointedGraphPromise;
}

function graphResult(result) {
  const interrupted = extractInterrupt(result);
  return {
    text: result.responseText || 'I completed the check.',
    payload: interrupted?.payload || result.latestPayload,
    rounds: result.round,
    stopReason: interrupted ? 'approval_required' : result.stopReason,
    interrupted: Boolean(interrupted),
    interrupt: interrupted,
    result: result.actionResult || null,
  };
}

async function runAgentGraph({ messages, userId, userTimeZone, threadId }) {
  const graph = await getCheckpointedGraph();
  const configForThread = graphThreadConfig(threadId);
  const result = await graph.invoke({
    providerInput: inputFromHistory(messages),
    userId,
    userTimeZone: userTimeZone || 'UTC',
    threadId,
    round: 0,
    toolCalls: [],
    latestPayload: null,
    responseText: '',
    stopReason: '',
    approval: null,
    approvalDecision: null,
    actionResult: null,
  }, {
    ...configForThread,
    recursionLimit: GRAPH_RECURSION_LIMIT,
  });

  return graphResult(result);
}

async function resumeAgentGraph({ threadId, userId, actionId, approved = true, body = {} }) {
  const graph = await getCheckpointedGraph();
  const configForThread = graphThreadConfig(threadId);
  const snapshot = await graph.getState(configForThread);
  const values = snapshot?.values || {};

  if (Number(values.userId) !== Number(userId)) {
    throw new HttpError(403, 'Agent graph does not belong to this user');
  }
  if (values.approval?.actionId !== actionId) {
    throw new HttpError(409, 'Agent approval is not the action currently paused in this conversation');
  }

  const result = await graph.invoke(new Command({
    resume: { approved, actionId, body },
  }), {
    ...configForThread,
    recursionLimit: GRAPH_RECURSION_LIMIT,
  });

  return graphResult(result);
}

module.exports = {
  runAgentGraph,
  resumeAgentGraph,
  createAgentGraph,
  _test: {
    AgentGraphState,
    extractResponseText,
    parseArguments,
    uiPayloadForTool,
    shouldClearPayload,
    inputFromHistory,
    normalizeApprovalDecision,
    extractInterrupt,
    graphResult,
    MAX_TOOL_ROUNDS,
    GRAPH_RECURSION_LIMIT,
  },
};
