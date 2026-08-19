const axios = require('axios');
const config = require('../config/env');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = 12000;

const SCHEMAS = {
  follow_up: {
    type: 'object',
    additionalProperties: false,
    properties: {
      message: { type: 'string' },
    },
    required: ['message'],
  },
  pre_call: {
    type: 'object',
    additionalProperties: false,
    properties: {
      goal: { type: 'string' },
      agenda: { type: 'array', items: { type: 'string' } },
      openingPrompt: { type: 'string' },
    },
    required: ['goal', 'agenda', 'openingPrompt'],
  },
  next_step: {
    type: 'object',
    additionalProperties: false,
    properties: {
      nextStep: { type: 'string' },
      followUpHint: { type: 'string' },
    },
    required: ['nextStep', 'followUpHint'],
  },
};

function cleanText(value, fallback = '', maxLength = 4000) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maxLength);
}

function firstName(value) {
  return cleanText(value, 'there', 160).split(/\s+/)[0] || 'there';
}

function meetingTypeKey(meeting) {
  return cleanText(meeting?.meetingType, 'meeting', 160).toLowerCase();
}

function nonEmptyAnswers(meeting) {
  return Array.isArray(meeting?.guestAnswers)
    ? meeting.guestAnswers.filter((item) => item && cleanText(item.answer))
    : [];
}

function buildFollowUpFallback(context = {}) {
  const meeting = context.persistedContext || {};
  const bookingUrl = cleanText(context.bookingUrl, 'the booking link I sent earlier', 1000);
  const touch = Number(meeting.followUpCount || 0);
  const type = meetingTypeKey(meeting);
  const name = firstName(meeting.attendeeName);

  const message = touch > 0
    ? `Hi ${name} — one more quick follow-up on our ${type}. If you'd still like to connect, you can pick a time here: ${bookingUrl}. If the timing isn't right, no worries.`
    : `Hi ${name} — just following up on our ${type}. Here's the booking link again in case it got buried: ${bookingUrl}. Happy to find another time if none of these work.`;

  return { message };
}

function buildPreCallFallback(context = {}) {
  const meeting = context.persistedContext || {};
  const answers = nonEmptyAnswers(meeting);
  const goal = cleanText(meeting.meetingGoal, 'Leave the call with a clear decision and next step.', 260);
  const type = meetingTypeKey(meeting);

  let middle = 'Explore the guest context and the main problem behind this conversation.';
  let close = 'Agree the next step, owner, and timing before ending the call.';

  if (type.includes('investor')) {
    middle = 'Test fit: thesis, stage, current interest, and the highest-value fundraising question.';
    close = 'Leave with a clear investor next step: materials, partner intro, diligence, or a defined no.';
  } else if (type.includes('candidate') || type.includes('recruit')) {
    middle = 'Validate role fit, motivation, availability, and the strongest evidence from past work.';
    close = 'Set expectations for the next interview step, owner, and timeline.';
  } else if (type.includes('client') || type.includes('kickoff')) {
    middle = 'Align scope, stakeholders, constraints, success criteria, and immediate delivery risks.';
    close = 'Confirm ownership, first deliverable, and the next client checkpoint.';
  } else if (type.includes('customer') || type.includes('discovery') || type.includes('sales')) {
    middle = 'Understand the current workflow, pain, urgency, decision process, and cost of doing nothing.';
    close = 'Decide whether there is a real fit and define the next commercial step.';
  }

  const contextAgenda = answers.slice(0, 2).map((item) => `Use guest context: ${cleanText(item.answer, '', 150)}`);
  const agenda = [
    `Open by confirming the goal: ${goal}`,
    ...contextAgenda,
    middle,
    close,
  ].slice(0, 5);

  const strongestAnswer = cleanText(answers[0]?.answer, '', 130);
  const openingPrompt = strongestAnswer
    ? `Thanks for sharing that context beforehand. You mentioned ${strongestAnswer}. Can you walk me through what matters most there?`
    : `Before we jump in, I want to make sure we use the time well. The goal I have for this call is: ${cleanText(goal, '', 150)}. What would make this conversation useful for you?`;

  return { goal, agenda, openingPrompt };
}

function buildNextStepFallback(context = {}) {
  const meeting = context.persistedContext || {};
  const type = meetingTypeKey(meeting);
  const happened = context.happened ?? meeting.happened ?? null;
  const useful = context.useful ?? meeting.useful ?? null;
  const notes = cleanText(context.notes, cleanText(meeting.outcomeNotes), 1200);

  if (happened === false) {
    return {
      nextStep: 'Send a short rescheduling note and offer a fresh set of times.',
      followUpHint: 'Follow up while the original meeting context is still fresh.',
    };
  }

  let nextStep = 'Send a concise recap with the agreed action, owner, and timing, then schedule the next checkpoint if one is needed.';
  let followUpHint = 'Choose a follow-up time that matches the commitment made on the call.';

  if (type.includes('investor')) {
    nextStep = 'Send the most relevant requested material and confirm the next investor step, such as a partner intro, diligence item, or follow-up conversation.';
    followUpHint = 'Follow up around the investor action you actually agreed, not with a generic check-in.';
  } else if (type.includes('candidate') || type.includes('recruit')) {
    nextStep = 'Record the hiring decision signal and send the candidate the concrete next interview step, owner, and expected timeline.';
    followUpHint = 'Use the hiring timeline discussed on the call as the follow-up anchor.';
  } else if (type.includes('client') || type.includes('kickoff')) {
    nextStep = 'Send the client a recap of scope, owners, first deliverable, and the next project checkpoint.';
    followUpHint = 'Schedule the next checkpoint around the first committed deliverable.';
  } else if (type.includes('customer') || type.includes('discovery') || type.includes('sales')) {
    nextStep = 'Send a focused recap of the problem and agreed commercial next step, then schedule the next decision point if there is real fit.';
    followUpHint = 'Anchor follow-up to the buyer action or decision date discussed on the call.';
  }

  if (useful === false) {
    nextStep = 'Close the loop clearly: record why the call was not useful and either end the thread or propose one specific corrective next step.';
  }

  if (notes) {
    followUpHint = `Use the recorded outcome notes as the source of truth: ${cleanText(notes, '', 220)}`;
  }

  return { nextStep, followUpHint };
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

function normalizeFollowUp(value, fallback) {
  return { message: cleanText(value?.message, fallback.message, 2000) };
}

function normalizePreCall(value, fallback) {
  const agenda = Array.isArray(value?.agenda)
    ? value.agenda.map((item) => cleanText(item, '', 500)).filter(Boolean).slice(0, 5)
    : fallback.agenda;
  return {
    goal: cleanText(value?.goal, fallback.goal, 1000),
    agenda: agenda.length ? agenda : fallback.agenda,
    openingPrompt: cleanText(value?.openingPrompt, fallback.openingPrompt, 1200),
  };
}

function normalizeNextStep(value, fallback) {
  return {
    nextStep: cleanText(value?.nextStep, fallback.nextStep, 2000),
    followUpHint: cleanText(value?.followUpHint, fallback.followUpHint, 1200),
  };
}

function fallbackFor(kind, context) {
  if (kind === 'follow_up') return buildFollowUpFallback(context);
  if (kind === 'pre_call') return buildPreCallFallback(context);
  if (kind === 'next_step') return buildNextStepFallback(context);
  throw new Error(`Unsupported workflow generation kind: ${kind}`);
}

function normalizeFor(kind, value, fallback) {
  if (kind === 'follow_up') return normalizeFollowUp(value, fallback);
  if (kind === 'pre_call') return normalizePreCall(value, fallback);
  if (kind === 'next_step') return normalizeNextStep(value, fallback);
  return fallback;
}

function instructionsFor(kind) {
  const shared = [
    'You generate a single workflow artifact for CallSync using only the persisted meeting context and the small editable context supplied by the host.',
    'Do not invent identities, dates, commitments, companies, decisions, or facts.',
    'Keep the result concise, useful, and directly editable by the host.',
    'Return only the requested structured output.',
  ];

  if (kind === 'follow_up') {
    shared.push('Write a natural follow-up message for a pending meeting request. Preserve the booking URL exactly when one is supplied. Do not sound salesy or guilt the guest.');
  } else if (kind === 'pre_call') {
    shared.push('Create a focused pre-call goal, at most five agenda items, and one natural opening prompt. Prioritize guest answers and the persisted meeting goal.');
  } else if (kind === 'next_step') {
    shared.push('Suggest one concrete next step and a short follow-up timing/anchoring hint based on the outcome draft and persisted meeting context. Do not claim an agreement unless it appears in the supplied context.');
  }

  return shared.join(' ');
}

async function callProvider(kind, context, fallback) {
  if (!config.openaiApiKey) return fallback;

  try {
    const response = await axios.post(OPENAI_RESPONSES_URL, {
      model: config.openaiModel,
      store: false,
      instructions: instructionsFor(kind),
      input: JSON.stringify({
        persistedMeeting: context.persistedContext || null,
        editableContext: Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'persistedContext')),
      }),
      text: {
        format: {
          type: 'json_schema',
          name: `callsync_${kind}`,
          strict: true,
          schema: SCHEMAS[kind],
        },
      },
      max_output_tokens: 1000,
    }, {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const raw = extractResponseText(response.data);
    if (!raw) throw new Error('Generation response did not contain structured text');
    return normalizeFor(kind, JSON.parse(raw), fallback);
  } catch (error) {
    console.error('Workflow generation provider failed; deterministic fallback used', {
      kind,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      upstreamStatus: error?.response?.status,
    });
    return fallback;
  }
}

async function generateWorkflowArtifact({ kind, context = {} }) {
  const fallback = fallbackFor(kind, context);
  return callProvider(kind, context, fallback);
}

module.exports = {
  generateWorkflowArtifact,
  _test: {
    buildFollowUpFallback,
    buildPreCallFallback,
    buildNextStepFallback,
    normalizeFollowUp,
    normalizePreCall,
    normalizeNextStep,
    extractResponseText,
  },
};
