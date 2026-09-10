const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { generateWorkflowContent } = require('./generationService');
const { getAgentAvailability } = require('./agentAvailabilityService');
const { prepareFollowUp } = require('./followUpService');
const { updateTaskStatus } = require('./actionMutationService');

const AGENT_ACTION_TOOLS = [
  {
    type: 'function',
    name: 'prepare_follow_up',
    description: 'Prepare an editable follow-up email for one pending meeting request. Use list_meetings first to identify the correct meeting ID.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { meetingId: { type: 'integer' } },
      required: ['meetingId'],
    },
  },
  {
    type: 'function',
    name: 'prepare_cancellation',
    description: 'Prepare a cancellation approval for one CallSync meeting. Use list_meetings first to identify the correct meeting ID.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { meetingId: { type: 'integer' } },
      required: ['meetingId'],
    },
  },
  {
    type: 'function',
    name: 'prepare_reschedule',
    description: 'Prepare new available times for an already-booked meeting. Use list_meetings first, then provide the user request containing the desired new day/time window.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        meetingId: { type: 'integer' },
        request: { type: 'string' },
        timeZone: { type: 'string' },
      },
      required: ['meetingId', 'request', 'timeZone'],
    },
  },
  {
    type: 'function',
    name: 'update_task_status',
    description: 'Complete or reopen one internal CallSync task. This is an internal workspace change and can execute immediately once the correct task ID is known.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        actionId: { type: 'integer' },
        status: { type: 'string', enum: ['open', 'completed'] },
      },
      required: ['actionId', 'status'],
    },
  },
];

const AGENT_ACTION_TOOL_NAMES = new Set(AGENT_ACTION_TOOLS.map((tool) => tool.name));

function cleanText(value, maxLength = 6000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validMeetingId(value) {
  const id = Number(value);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Valid meeting ID required');
  return id;
}

async function loadMeetingForAction(userId, meetingId) {
  const id = validMeetingId(meetingId);
  const result = await pool.query(
    `SELECT m.id, m.attendee_name, m.attendee_email, m.meeting_type, m.meeting_goal,
            m.duration_minutes, m.status, m.selected_slot, m.created_at,
            s.id AS selected_slot_id, s.slot_time, s.google_event_id, s.outlook_event_id
     FROM meetings m
     LEFT JOIN slots s ON s.meeting_id = m.id AND s.is_selected = TRUE
     WHERE m.id = $1 AND m.user_id = $2`,
    [id, userId]
  );
  const meeting = result.rows[0];
  if (!meeting) throw new HttpError(404, 'Meeting not found');
  return meeting;
}

async function prepareCancellation(userId, args) {
  const meeting = await loadMeetingForAction(userId, args.meetingId);
  if (meeting.status === 'cancelled') throw new HttpError(409, 'Meeting is already cancelled');

  return {
    proposal: {
      meetingId: meeting.id,
      attendeeName: meeting.attendee_name || meeting.attendee_email,
      attendeeEmail: meeting.attendee_email,
      meetingType: meeting.meeting_type || 'Meeting',
      status: meeting.status,
      selectedSlot: meeting.selected_slot,
    },
  };
}

async function prepareReschedule(userId, args) {
  const meeting = await loadMeetingForAction(userId, args.meetingId);
  if (meeting.status !== 'confirmed') throw new HttpError(409, 'Only booked meetings can be rescheduled');
  if (!meeting.selected_slot_id) throw new HttpError(409, 'Selected calendar event could not be found for this meeting');

  const request = cleanText(args.request);
  if (!request) throw new HttpError(400, 'Tell CallSync when you want to move the meeting');
  const timeZone = cleanText(args.timeZone, 120) || 'UTC';

  const draft = await generateWorkflowContent({
    kind: 'meeting_brief',
    context: {
      prompt: [
        `Reschedule the existing ${meeting.duration_minutes || 60}-minute meeting with ${meeting.attendee_name || meeting.attendee_email}.`,
        `Keep the duration at ${meeting.duration_minutes || 60} minutes.`,
        `User request: ${request}`,
      ].join(' '),
    },
  });

  const form = draft?.formPatch || {};
  if (!form.selectedDate) {
    return { status: 'needs_input', missing: ['new date'] };
  }

  const availability = await getAgentAvailability({
    userId,
    date: form.selectedDate,
    options: {
      workStartHour: form.workStartHour,
      workEndHour: form.workEndHour,
      durationMinutes: meeting.duration_minutes || 60,
      slotIntervalMinutes: form.slotIntervalMinutes,
      bufferMinutes: form.bufferMinutes,
      timeZone,
    },
    ignoreEvents: {
      googleEventId: meeting.google_event_id,
      outlookEventId: meeting.outlook_event_id,
    },
  });

  const currentTime = new Date(meeting.selected_slot).getTime();
  const slots = availability.rankedSlots
    .map((slot) => slot.time)
    .filter((slot) => new Date(slot).getTime() !== currentTime)
    .slice(0, 4);

  if (!slots.length) {
    return {
      status: 'no_availability',
      date: form.selectedDate,
      durationMinutes: meeting.duration_minutes || 60,
      timeZone: availability.timeZone,
    };
  }

  return {
    status: 'ready',
    proposal: {
      meetingId: meeting.id,
      attendeeName: meeting.attendee_name || meeting.attendee_email,
      attendeeEmail: meeting.attendee_email,
      meetingType: meeting.meeting_type || 'Meeting',
      previousSlot: meeting.selected_slot,
      date: form.selectedDate,
      durationMinutes: meeting.duration_minutes || 60,
      timeZone: availability.timeZone,
      slots,
      selectedSlot: slots[0],
    },
  };
}

async function executeAgentActionTool({ name, args, userId }) {
  if (name === 'prepare_follow_up') {
    return { status: 'ready', ...(await prepareFollowUp({ userId, meetingId: validMeetingId(args.meetingId) })) };
  }
  if (name === 'prepare_cancellation') {
    return { status: 'ready', ...(await prepareCancellation(userId, args)) };
  }
  if (name === 'prepare_reschedule') {
    return prepareReschedule(userId, args);
  }
  if (name === 'update_task_status') {
    return updateTaskStatus({ userId, actionId: args.actionId, status: args.status });
  }
  throw new HttpError(400, `Unsupported action agent tool: ${name}`);
}

module.exports = {
  AGENT_ACTION_TOOLS,
  AGENT_ACTION_TOOL_NAMES,
  executeAgentActionTool,
  _test: { validMeetingId },
};
