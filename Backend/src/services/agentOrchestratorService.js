const axios = require('axios');
const config = require('../config/env');
const { CALLSYNC_AGENT_TOOLS, executeAgentTool } = require('./agentRegistry');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_TOOL_ROUNDS = 6;
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
  if (name === 'prepare_schedule' && result.status === 'ready') {
    return { type: 'schedule_confirmation', proposal: result.proposal };
  }
  if (name === 'prepare_follow_up' && result.status === 'ready') {
    return { type: 'follow_up_confirmation', proposal: result.proposal };
  }
  if (name === 'prepare_cancellation' && result.status === 'ready') {
    return { type: 'cancel_confirmation', proposal: result.proposal };
  }
  if (name === 'prepare_reschedule' && result.status === 'ready') {
    return { type: 'reschedule_confirmation', proposal: result.proposal };
  }
  if (name === 'update_task_status' && result.action) {
    return { type: 'task_update', action: result.action, message: result.message };
  }
  return null;
}

function inputFromHistory(messages) {
  return messages.slice(-24).map((message) => ({
    role: message.role,
    content: cleanText(message.content, 10000),
  }));
}

async function callProvider({ messages, userId, userTimeZone }) {
  if (!config.openaiApiKey) return null;

  let input = inputFromHistory(messages);
  let latestPayload = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await axios.post(OPENAI_RESPONSES_URL, {
      model: config.openaiModel,
      store: false,
      instructions: `${INSTRUCTIONS} Runtime timezone: ${userTimeZone || 'UTC'}.`,
      input,
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

    const calls = (response.data.output || []).filter((item) => item.type === 'function_call');
    if (!calls.length) {
      return {
        text: extractResponseText(response.data) || 'I completed the check.',
        payload: latestPayload,
      };
    }

    const outputs = [];
    for (const call of calls) {
      const args = parseArguments(call.arguments);
      if (['prepare_schedule', 'prepare_reschedule'].includes(call.name) && !args.timeZone) {
        args.timeZone = userTimeZone || 'UTC';
      }
      const result = await executeAgentTool({ name: call.name, args, userId });
      latestPayload = uiPayloadForTool(call.name, result) || latestPayload;
      outputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    input = [...input, ...calls, ...outputs];
  }

  return {
    text: 'I reached the safe tool limit for this request. Try narrowing the request to one meeting or one action.',
    payload: latestPayload,
  };
}

async function fallbackTurn({ message, userId, userTimeZone }) {
  const text = cleanText(message, 6000);
  const lower = text.toLowerCase();

  if (/\b(schedule|book|arrange|set up|find (?:a )?time|send (?:an )?invite|create (?:a )?meeting)\b/.test(lower)) {
    const result = await executeAgentTool({
      name: 'prepare_schedule',
      args: { request: text, timeZone: userTimeZone || 'UTC' },
      userId,
    });
    if (result.status === 'needs_input') {
      return { text: `I can do that. I still need the ${result.missing.join(' and ')}.`, payload: null };
    }
    if (result.status === 'no_availability') {
      return {
        text: `I could not find an available ${result.durationMinutes}-minute window on ${result.date}. Give me another day or time window.`,
        payload: null,
      };
    }
    return {
      text: 'I checked your connected calendars and prepared the meeting. Confirm below before I create holds or send anything.',
      payload: uiPayloadForTool('prepare_schedule', result),
    };
  }

  if (/\b(tasks?|to-?dos?|commitments?|actions?)\b/.test(lower)) {
    const result = await executeAgentTool({ name: 'list_open_tasks', args: {}, userId });
    return {
      text: result.tasks.length ? 'These are your open meeting tasks.' : 'You have no open meeting tasks.',
      payload: uiPayloadForTool('list_open_tasks', result),
    };
  }

  if (/\b(meetings?|calls?|upcoming|booked|pending)\b/.test(lower)) {
    const result = await executeAgentTool({ name: 'list_meetings', args: { status: 'all' }, userId });
    return {
      text: result.meetings.length ? 'Here are your active meetings.' : 'You do not have any active meetings.',
      payload: uiPayloadForTool('list_meetings', result),
    };
  }

  return {
    text: 'I can work with your meetings, people, tasks, preparation, scheduling, follow-ups, cancellations, and rescheduling. Tell me the outcome you want.',
    payload: null,
  };
}

async function runAgentTurn({ messages, message, userId, userTimeZone }) {
  try {
    const provider = await callProvider({ messages, userId, userTimeZone });
    if (provider) return provider;
  } catch (error) {
    console.error('Agent provider failed; server fallback used', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      upstreamStatus: error?.response?.status,
    });
  }

  return fallbackTurn({ message, userId, userTimeZone });
}

module.exports = {
  runAgentTurn,
  _test: { extractResponseText, parseArguments, uiPayloadForTool },
};
