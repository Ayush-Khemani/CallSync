const axios = require('axios');
const { StateGraph, StateSchema, START, END } = require('@langchain/langgraph');
const z = require('zod');
const config = require('../config/env');
const { CALLSYNC_AGENT_TOOLS, executeAgentTool } = require('./agentRegistry');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_TOOL_ROUNDS = 6;
const GRAPH_RECURSION_LIMIT = (MAX_TOOL_ROUNDS * 2) + 4;
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
  round: z.number().int().nonnegative().default(0),
  toolCalls: z.array(z.any()).default([]),
  latestPayload: z.any().nullable().default(null),
  responseText: z.string().default(''),
  stopReason: z.string().default(''),
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

function createAgentGraph({ providerCall = defaultProviderCall, toolExecutor = executeAgentTool } = {}) {
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

  function routeAfterModel(state) {
    if (state.stopReason || state.responseText) return END;
    return state.toolCalls.length ? 'tools' : END;
  }

  return new StateGraph(AgentGraphState)
    .addNode('model', modelNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'model')
    .addConditionalEdges('model', routeAfterModel, ['tools', END])
    .addEdge('tools', 'model')
    .compile();
}

const agentGraph = createAgentGraph();

async function runAgentGraph({ messages, userId, userTimeZone }) {
  const result = await agentGraph.invoke({
    providerInput: inputFromHistory(messages),
    userId,
    userTimeZone: userTimeZone || 'UTC',
    round: 0,
    toolCalls: [],
    latestPayload: null,
    responseText: '',
    stopReason: '',
  }, {
    recursionLimit: GRAPH_RECURSION_LIMIT,
  });

  return {
    text: result.responseText || 'I completed the check.',
    payload: result.latestPayload,
    rounds: result.round,
    stopReason: result.stopReason,
  };
}

module.exports = {
  runAgentGraph,
  createAgentGraph,
  _test: {
    AgentGraphState,
    extractResponseText,
    parseArguments,
    uiPayloadForTool,
    shouldClearPayload,
    inputFromHistory,
    MAX_TOOL_ROUNDS,
    GRAPH_RECURSION_LIMIT,
  },
};
