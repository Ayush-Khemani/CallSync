const axios = require('axios');
const config = require('../config/env');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = 12000;

const MEETING_TEMPLATES = {
  founder: {
    label: 'Founder sales',
    type: 'Customer discovery',
    goal: 'Confirm the buyer pain, current workflow, urgency, and the next commercial step.',
    durationMinutes: 30,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 10,
    workEndHour: 17,
    questions: [
      'What problem are you trying to solve?',
      'What tools are you using today?',
      'What made this worth exploring now?',
      'What would make this call successful?',
    ],
    message: 'Thanks for the reply. Pick a time that works and share a little context so we can use the call to decide whether there is a real fit.',
  },
  investor: {
    label: 'Investor intro',
    type: 'Investor meeting',
    goal: 'Set up a concise investor conversation with fund context, stage fit, and the highest-value topic known before the call.',
    durationMinutes: 30,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 13,
    workEndHour: 18,
    questions: [
      'What fund or company are you with?',
      'What stage do you usually invest in?',
      'What made the company interesting to you?',
      'Any topic you want me to cover first?',
    ],
    message: 'Great to connect. Choose one of these focused windows and I will come prepared with the right fundraising context instead of a generic intro.',
  },
  recruiting: {
    label: 'Recruiting screen',
    type: 'Candidate screen',
    goal: 'Run a structured candidate screen with role interest, availability, compensation expectations, and a discussion anchor ready.',
    durationMinutes: 45,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 9,
    workEndHour: 16,
    questions: [
      'Which role are you most interested in?',
      'What is your earliest start date?',
      'What compensation range should we be aware of?',
      'Share one project you would like to discuss.',
    ],
    message: 'Choose a time that works for you and add the context below. I will review it before we speak so the screen starts with substance.',
  },
  client: {
    label: 'Client onboarding',
    type: 'Client kickoff',
    goal: 'Align the desired outcome, stakeholders, timeline, constraints, and immediate next steps before the kickoff.',
    durationMinutes: 60,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 10,
    workEndHour: 16,
    questions: [
      'What outcome do you want from this project?',
      'Who needs to be involved?',
      'What constraints should we know before the kickoff?',
      'Is there a target deadline?',
    ],
    message: 'Use this link to pick a kickoff time. Your answers will shape the agenda so we can leave with ownership, scope, and next steps clear.',
  },
};

const MEETING_BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    formPatch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        attendeeEmail: { type: 'string' },
        attendeeName: { type: 'string' },
        selectedDate: { type: 'string' },
        durationMinutes: { type: 'integer' },
        bufferMinutes: { type: 'integer' },
        slotIntervalMinutes: { type: 'integer' },
        workStartHour: { type: 'integer' },
        workEndHour: { type: 'integer' },
      },
      required: [
        'attendeeEmail',
        'attendeeName',
        'selectedDate',
        'durationMinutes',
        'bufferMinutes',
        'slotIntervalMinutes',
        'workStartHour',
        'workEndHour',
      ],
    },
    brief: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string' },
        goal: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
        message: { type: 'string' },
      },
      required: ['type', 'goal', 'questions', 'message'],
    },
    insights: { type: 'array', items: { type: 'string' } },
  },
  required: ['formPatch', 'brief', 'insights'],
};

function cleanText(value, fallback = '', maxLength = 5000) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, maxLength);
}

function allowedNumber(value, allowed, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : fallback;
}

function boundedHour(value, fallback, allow24 = false) {
  const number = Number(value);
  const max = allow24 ? 24 : 23;
  return Number.isInteger(number) && number >= 0 && number <= max ? number : fallback;
}

function formatInputDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferMeetingTemplate(text) {
  const prompt = text.toLowerCase();
  if (prompt.includes('investor') || prompt.includes('fundraising') || prompt.includes('fundraise') || prompt.includes('vc') || prompt.includes('fund ')) return 'investor';
  if (prompt.includes('candidate') || prompt.includes('interview') || prompt.includes('recruit') || prompt.includes('hiring') || prompt.includes('screen')) return 'recruiting';
  if (prompt.includes('client') || prompt.includes('kickoff') || prompt.includes('onboarding') || prompt.includes('scope') || prompt.includes('stakeholder')) return 'client';
  return 'founder';
}

function inferDuration(text, fallback) {
  const match = text.match(/(\d{1,3})\s*(minute|min|mins)/i);
  if (!match) return fallback;
  return allowedNumber(match[1], [15, 30, 45, 60], fallback);
}

function inferSelectedDate(text, now = new Date()) {
  const prompt = text.toLowerCase();
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return '';
  if (prompt.includes('tomorrow')) {
    date.setUTCDate(date.getUTCDate() + 1);
    return formatInputDate(date);
  }
  if (prompt.includes('next week')) {
    date.setUTCDate(date.getUTCDate() + 7);
    return formatInputDate(date);
  }
  const explicit = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return explicit?.[1] || '';
}

function inferWorkWindow(text, template) {
  const prompt = text.toLowerCase();
  if (prompt.includes('morning')) return { workStartHour: 9, workEndHour: 12, label: 'Morning window' };
  if (prompt.includes('afternoon')) return { workStartHour: 13, workEndHour: 17, label: 'Afternoon window' };
  if (prompt.includes('evening')) return { workStartHour: 17, workEndHour: 20, label: 'Evening window' };
  return { workStartHour: template.workStartHour, workEndHour: template.workEndHour, label: 'Template working window' };
}

function inferGuest(text) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const nameMatch = text.match(/\b(?:with|for|to)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})\b/);
  return {
    attendeeEmail: email,
    attendeeName: nameMatch ? nameMatch[1].trim() : '',
  };
}

function inferQuestions(text, templateQuestions) {
  const prompt = text.toLowerCase();
  const questions = [...templateQuestions];
  if (prompt.includes('budget') && !questions.some((question) => question.toLowerCase().includes('budget'))) {
    questions.push('What budget range should we keep in mind?');
  }
  if ((prompt.includes('timeline') || prompt.includes('deadline')) && !questions.some((question) => question.toLowerCase().includes('deadline'))) {
    questions.push('What timeline or deadline matters most?');
  }
  if (prompt.includes('decision') && !questions.some((question) => question.toLowerCase().includes('decision'))) {
    questions.push('Who is involved in the decision?');
  }
  return questions.slice(0, 5);
}

function buildMeetingBriefFallback(context = {}) {
  const prompt = cleanText(context.prompt, '', 4000);
  const templateKey = inferMeetingTemplate(prompt);
  const template = MEETING_TEMPLATES[templateKey];
  const window = inferWorkWindow(prompt, template);
  const guest = inferGuest(prompt);
  const durationMinutes = inferDuration(prompt, template.durationMinutes);
  const selectedDate = inferSelectedDate(prompt, context.now ? new Date(context.now) : new Date());
  const questions = inferQuestions(prompt, template.questions);

  return {
    formPatch: {
      ...guest,
      selectedDate,
      durationMinutes,
      bufferMinutes: template.bufferMinutes,
      slotIntervalMinutes: template.slotIntervalMinutes,
      workStartHour: window.workStartHour,
      workEndHour: window.workEndHour,
    },
    brief: {
      type: template.type,
      goal: template.goal,
      questions,
      message: template.message,
    },
    insights: [
      `${template.label} intent`,
      `${durationMinutes} minute call`,
      `${template.bufferMinutes} minute buffer`,
      window.label,
      `${questions.length} qualification questions`,
      selectedDate ? `Date set to ${selectedDate}` : 'Host chooses date',
    ],
  };
}

function normalizeMeetingBrief(value, fallback) {
  const formPatch = value?.formPatch || {};
  const brief = value?.brief || {};
  const durationMinutes = allowedNumber(formPatch.durationMinutes, [15, 30, 45, 60], fallback.formPatch.durationMinutes);
  const bufferMinutes = allowedNumber(formPatch.bufferMinutes, [0, 5, 10, 15, 30], fallback.formPatch.bufferMinutes);
  const slotIntervalMinutes = allowedNumber(formPatch.slotIntervalMinutes, [15, 30, 60], fallback.formPatch.slotIntervalMinutes);
  let workStartHour = boundedHour(formPatch.workStartHour, fallback.formPatch.workStartHour);
  let workEndHour = boundedHour(formPatch.workEndHour, fallback.formPatch.workEndHour, true);
  if (workEndHour <= workStartHour) {
    workStartHour = fallback.formPatch.workStartHour;
    workEndHour = fallback.formPatch.workEndHour;
  }

  const selectedDate = /^20\d{2}-\d{2}-\d{2}$/.test(formPatch.selectedDate || '')
    ? formPatch.selectedDate
    : fallback.formPatch.selectedDate;
  const questions = Array.isArray(brief.questions)
    ? brief.questions.map((item) => cleanText(item, '', 300)).filter(Boolean).slice(0, 5)
    : fallback.brief.questions;

  return {
    formPatch: {
      attendeeEmail: cleanText(formPatch.attendeeEmail, fallback.formPatch.attendeeEmail, 320),
      attendeeName: cleanText(formPatch.attendeeName, fallback.formPatch.attendeeName, 160),
      selectedDate,
      durationMinutes,
      bufferMinutes,
      slotIntervalMinutes,
      workStartHour,
      workEndHour,
    },
    brief: {
      type: cleanText(brief.type, fallback.brief.type, 120),
      goal: cleanText(brief.goal, fallback.brief.goal, 1200),
      questions: questions.length ? questions : fallback.brief.questions,
      message: cleanText(brief.message, fallback.brief.message, 2000),
    },
    insights: Array.isArray(value?.insights)
      ? value.insights.map((item) => cleanText(item, '', 160)).filter(Boolean).slice(0, 6)
      : fallback.insights,
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        texts.push(content.text);
      }
    }
  }
  return texts.join('\n').trim();
}

function logGenerationFailure(error) {
  console.error('Generation provider failed; deterministic fallback used', {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    upstreamStatus: error?.response?.status,
  });
}

async function generateMeetingBrief(context = {}) {
  const fallback = buildMeetingBriefFallback(context);
  if (!config.openaiApiKey) {
    return fallback;
  }

  const prompt = cleanText(context.prompt, '', 4000);
  if (!prompt) {
    return fallback;
  }

  try {
    const response = await axios.post(OPENAI_RESPONSES_URL, {
      model: config.openaiModel,
      store: false,
      instructions: [
        'You are the server-side meeting setup generator for CallSync.',
        'Generate a focused meeting request from only the supplied context.',
        'Do not invent a guest identity, email address, date, company, deadline, or factual claim that the user did not provide.',
        'Use an empty string for unknown guest/date fields.',
        'Allowed durations: 15, 30, 45, 60 minutes.',
        'Allowed buffers: 0, 5, 10, 15, 30 minutes.',
        'Allowed slot intervals: 15, 30, 60 minutes.',
        'Use at most five concise qualification questions.',
        'Keep invite copy natural, specific to the meeting intent, and editable by the host.',
        'Return only the requested structured output.',
      ].join(' '),
      input: JSON.stringify({ prompt, persistedContext: context.persistedContext || null }),
      text: {
        format: {
          type: 'json_schema',
          name: 'callsync_meeting_brief',
          strict: true,
          schema: MEETING_BRIEF_SCHEMA,
        },
      },
      max_output_tokens: 1200,
    }, {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const raw = extractResponseText(response.data);
    if (!raw) {
      throw new Error('Generation response did not contain structured text');
    }

    return normalizeMeetingBrief(JSON.parse(raw), fallback);
  } catch (error) {
    logGenerationFailure(error);
    return fallback;
  }
}

async function generateWorkflowContent({ kind, context = {} }) {
  if (kind === 'meeting_brief') {
    return generateMeetingBrief(context);
  }
  throw new Error(`Unsupported generation kind: ${kind}`);
}

module.exports = {
  generateWorkflowContent,
  _test: {
    buildMeetingBriefFallback,
    normalizeMeetingBrief,
    extractResponseText,
    inferMeetingTemplate,
  },
};
