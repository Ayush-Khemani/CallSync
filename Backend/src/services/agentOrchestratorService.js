const config = require('../config/env');
const { executeAgentTool } = require('./agentRegistry');
const { runAgentGraph, resumeAgentGraph, _test: graphTest } = require('./agentGraphService');

function cleanText(value, maxLength = 6000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function fallbackTurn({ message, userId, userTimeZone }) {
  const text = cleanText(message);
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
      payload: graphTest.uiPayloadForTool('prepare_schedule', result),
      interrupted: false,
    };
  }

  if (/\b(tasks?|to-?dos?|commitments?|actions?)\b/.test(lower)) {
    const result = await executeAgentTool({ name: 'list_open_tasks', args: {}, userId });
    return {
      text: result.tasks.length ? 'These are your open meeting tasks.' : 'You have no open meeting tasks.',
      payload: graphTest.uiPayloadForTool('list_open_tasks', result),
      interrupted: false,
    };
  }

  if (/\b(meetings?|calls?|upcoming|booked|pending)\b/.test(lower)) {
    const result = await executeAgentTool({ name: 'list_meetings', args: { status: 'all' }, userId });
    return {
      text: result.meetings.length ? 'Here are your active meetings.' : 'You do not have any active meetings.',
      payload: graphTest.uiPayloadForTool('list_meetings', result),
      interrupted: false,
    };
  }

  return {
    text: 'The AI provider is temporarily unavailable. I can still help with basic meeting, task, and scheduling checks.',
    payload: null,
    interrupted: false,
  };
}

async function runAgentTurn({ messages, message, userId, userTimeZone, threadId }) {
  if (config.openaiApiKey) {
    try {
      return await runAgentGraph({ messages, userId, userTimeZone, threadId });
    } catch (error) {
      console.error('LangGraph agent run failed; server fallback used', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        upstreamStatus: error?.response?.status,
      });
    }
  }

  return fallbackTurn({ message, userId, userTimeZone });
}

async function resumeAgentTurn({ threadId, userId, actionId, approved = true, body = {} }) {
  return resumeAgentGraph({ threadId, userId, actionId, approved, body });
}

module.exports = {
  runAgentTurn,
  resumeAgentTurn,
  _test: {
    ...graphTest,
    fallbackTurn,
  },
};
