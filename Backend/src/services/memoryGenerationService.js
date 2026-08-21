const axios = require('axios');
const config = require('../config/env');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = 12000;

const MEMORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task: { type: 'string' },
          owner: { type: 'string' },
          dueAt: { type: 'string' },
        },
        required: ['task', 'owner', 'dueAt'],
      },
    },
    unansweredQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'keyPoints', 'decisions', 'actionItems', 'unansweredQuestions'],
};

function cleanText(value, fallback = '', maxLength = 5000) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().replace(/[ \t]+/g, ' ');
  return (text || fallback).slice(0, maxLength);
}

function unique(values, maxItems = 10) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = cleanText(value, '', 1200);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

function noteStatements(notes) {
  return cleanText(notes, '', 20000)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((item) => cleanText(item, '', 1200))
    .filter(Boolean);
}

function buildMemoryFallback(context = {}) {
  const meeting = context.persistedContext || {};
  const notes = cleanText(context.notes, cleanText(meeting.notes, ''), 20000);
  const statements = noteStatements(notes);
  const outcomeNotes = noteStatements(meeting.outcomeNotes || '');
  const combined = unique([...statements, ...outcomeNotes], 20);

  const decisions = unique(combined.filter((item) => /\b(decided|decision|agreed|approved|confirmed|will proceed|chose)\b/i.test(item)), 8);
  const actionLines = combined.filter((item) => /\b(action|todo|to-do|next step|follow[- ]?up|send|schedule|introduce|prepare|share)\b/i.test(item));
  const unansweredQuestions = unique(combined.filter((item) => item.endsWith('?')), 8);
  const keyPoints = unique(combined.filter((item) => !item.endsWith('?') && !actionLines.includes(item)), 6);

  const fallbackSummaryParts = keyPoints.length
    ? keyPoints.slice(0, 3)
    : unique([
      meeting.outcomeNotes,
      meeting.meetingGoal,
      meeting.inviteMessage,
    ], 3);

  return {
    summary: cleanText(fallbackSummaryParts.join(' '), 'No meeting notes have been captured yet.', 3000),
    keyPoints,
    decisions,
    actionItems: unique(actionLines, 8).map((task) => ({ task, owner: '', dueAt: '' })),
    unansweredQuestions,
  };
}

function normalizeActionItems(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => ({
      task: cleanText(item?.task, '', 1200),
      owner: cleanText(item?.owner, '', 200),
      dueAt: cleanText(item?.dueAt, '', 100),
    }))
    .filter((item) => item.task)
    .slice(0, 12);
  return items.length ? items : fallback;
}

function normalizeMemory(value, fallback) {
  return {
    summary: cleanText(value?.summary, fallback.summary, 5000),
    keyPoints: Array.isArray(value?.keyPoints) ? unique(value.keyPoints, 12) : fallback.keyPoints,
    decisions: Array.isArray(value?.decisions) ? unique(value.decisions, 12) : fallback.decisions,
    actionItems: normalizeActionItems(value?.actionItems, fallback.actionItems),
    unansweredQuestions: Array.isArray(value?.unansweredQuestions) ? unique(value.unansweredQuestions, 12) : fallback.unansweredQuestions,
  };
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

async function generateMeetingMemory(context = {}) {
  const fallback = buildMemoryFallback(context);
  if (!config.openaiApiKey) return fallback;

  try {
    const response = await axios.post(OPENAI_RESPONSES_URL, {
      model: config.openaiModel,
      store: false,
      instructions: [
        'Create a durable CallSync meeting memory using only the captured meeting notes and persisted meeting context supplied.',
        'Do not invent decisions, owners, deadlines, commitments, people, companies, or facts.',
        'If an owner or due date is not explicitly known, return an empty string for that field.',
        'Keep key points, decisions, action items, and unanswered questions concise and directly editable.',
        'The summary must explain what was discussed and what matters next, without adding unsupported claims.',
        'Return only the requested structured output.',
      ].join(' '),
      input: JSON.stringify({
        capturedNotes: cleanText(context.notes, '', 20000),
        persistedMeeting: context.persistedContext || null,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'callsync_meeting_memory',
          strict: true,
          schema: MEMORY_SCHEMA,
        },
      },
      max_output_tokens: 1400,
    }, {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const raw = extractResponseText(response.data);
    if (!raw) throw new Error('Memory generation response did not contain structured text');
    return normalizeMemory(JSON.parse(raw), fallback);
  } catch (error) {
    console.error('Meeting memory generation failed; deterministic fallback used', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      upstreamStatus: error?.response?.status,
    });
    return fallback;
  }
}

module.exports = {
  generateMeetingMemory,
  _test: {
    buildMemoryFallback,
    normalizeMemory,
    noteStatements,
    extractResponseText,
  },
};
