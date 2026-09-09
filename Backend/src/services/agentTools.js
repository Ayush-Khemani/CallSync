const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { generateWorkflowContent } = require('./generationService');
const { generateWorkflowArtifact } = require('./workflowGenerationService');
const { getAgentAvailability } = require('./agentAvailabilityService');

const AGENT_TOOLS = [
  {
    type: 'function',
    name: 'list_meetings',
    description: 'List the signed-in user\'s CallSync meetings. Use this before answering questions about upcoming, pending, booked, or recent meetings.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['all', 'pending', 'confirmed'] },
      },
      required: ['status'],
    },
  },
  {
    type: 'function',
    name: 'list_open_tasks',
    description: 'List open commitments/tasks created from the user\'s meetings.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'find_person',
    description: 'Find meeting history and current commitments for a person by name or email.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'prepare_schedule',
    description: 'Interpret a natural-language scheduling request and check real connected-calendar availability. Use for creating, arranging, or finding times for a new meeting.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        request: { type: 'string' },
        timeZone: { type: 'string' },
      },
      required: ['request', 'timeZone'],
    },
  },
  {
    type: 'function',
    name: 'prepare_for_meeting',
    description: 'Generate a focused pre-call brief for one existing confirmed meeting. Use a meeting ID obtained from list_meetings.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        meetingId: { type: 'integer' },
      },
      required: ['meetingId'],
    },
  },
];

function cleanText(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function mapMeeting(row) {
  return {
    id: row.id,
    attendeeName: row.attendee_name || '',
    attendeeEmail: row.attendee_email || '',
    status: row.status,
    selectedSlot: row.selected_slot,
    createdAt: row.created_at,
    meetingType: row.meeting_type || 'Meeting',
    meetingGoal: row.meeting_goal || '',
    durationMinutes: row.duration_minutes || 60,
  };
}

async function listMeetings(userId, args = {}) {
  const status = ['pending', 'confirmed'].includes(args.status) ? args.status : null;
  const params = [userId];
  const statusClause = status ? 'AND status = $2' : "AND status <> 'cancelled'";
  if (status) params.push(status);

  const result = await pool.query(
    `SELECT id, attendee_name, attendee_email, status, selected_slot, created_at,
            meeting_type, meeting_goal, duration_minutes
     FROM meetings
     WHERE user_id = $1 ${statusClause}
     ORDER BY
       CASE WHEN status = 'confirmed' AND selected_slot >= NOW() THEN 0
            WHEN status = 'pending' THEN 1 ELSE 2 END,
       COALESCE(selected_slot, created_at) ASC
     LIMIT 20`,
    params
  );

  return { meetings: result.rows.map(mapMeeting) };
}

async function listOpenTasks(userId) {
  const result = await pool.query(
    `SELECT a.id, a.meeting_id, a.title, a.due_at, a.created_at,
            m.attendee_name, m.attendee_email, m.meeting_type
     FROM meeting_actions a
     JOIN meetings m ON m.id = a.meeting_id
     WHERE a.user_id = $1 AND a.status = 'open'
     ORDER BY a.due_at ASC NULLS LAST, a.created_at ASC
     LIMIT 20`,
    [userId]
  );

  return {
    tasks: result.rows.map((row) => ({
      actionId: row.id,
      meetingId: row.meeting_id,
      title: row.title,
      dueAt: row.due_at,
      attendeeName: row.attendee_name || '',
      attendeeEmail: row.attendee_email || '',
      meetingType: row.meeting_type || 'Meeting',
    })),
  };
}

async function findPerson(userId, args = {}) {
  const query = cleanText(args.query, 320);
  if (!query) throw new HttpError(400, 'Person name or email required');
  const pattern = `%${query.replace(/[%_]/g, '\\$&')}%`;

  const meetings = await pool.query(
    `SELECT id, attendee_name, attendee_email, status, selected_slot, created_at,
            meeting_type, meeting_goal, outcome_next_step, memory_summary
     FROM meetings
     WHERE user_id = $1
       AND status <> 'cancelled'
       AND (attendee_name ILIKE $2 ESCAPE '\\' OR attendee_email ILIKE $2 ESCAPE '\\')
     ORDER BY COALESCE(selected_slot, created_at) DESC
     LIMIT 10`,
    [userId, pattern]
  );

  if (!meetings.rows.length) return { found: false, meetings: [], openTasks: [] };

  const email = meetings.rows[0].attendee_email;
  const tasks = await pool.query(
    `SELECT a.id, a.meeting_id, a.title, a.due_at
     FROM meeting_actions a
     JOIN meetings m ON m.id = a.meeting_id
     WHERE a.user_id = $1 AND a.status = 'open' AND m.attendee_email = $2
     ORDER BY a.due_at ASC NULLS LAST`,
    [userId, email]
  );

  return {
    found: true,
    person: {
      name: meetings.rows[0].attendee_name || '',
      email,
    },
    meetings: meetings.rows.map((row) => ({
      ...mapMeeting(row),
      context: row.memory_summary || row.outcome_next_step || row.meeting_goal || '',
    })),
    openTasks: tasks.rows.map((row) => ({
      actionId: row.id,
      meetingId: row.meeting_id,
      title: row.title,
      dueAt: row.due_at,
    })),
  };
}

function missingScheduleFields(draft) {
  const form = draft?.formPatch || {};
  const missing = [];
  if (!form.attendeeName) missing.push('guest name');
  if (!form.attendeeEmail) missing.push('guest email');
  if (!form.selectedDate) missing.push('date');
  return missing;
}

async function prepareSchedule(userId, args = {}) {
  const request = cleanText(args.request, 6000);
  if (!request) throw new HttpError(400, 'Scheduling request required');
  const timeZone = cleanText(args.timeZone, 120) || 'UTC';

  const draft = await generateWorkflowContent({
    kind: 'meeting_brief',
    context: { prompt: request },
  });
  const missing = missingScheduleFields(draft);
  if (missing.length) {
    return { status: 'needs_input', missing, draft };
  }

  const form = draft.formPatch;
  const availability = await getAgentAvailability({
    userId,
    date: form.selectedDate,
    options: {
      workStartHour: form.workStartHour,
      workEndHour: form.workEndHour,
      durationMinutes: form.durationMinutes,
      slotIntervalMinutes: form.slotIntervalMinutes,
      bufferMinutes: form.bufferMinutes,
      timeZone,
    },
  });

  const slots = availability.rankedSlots.slice(0, 4).map((slot) => slot.time);
  if (!slots.length) {
    return {
      status: 'no_availability',
      date: form.selectedDate,
      durationMinutes: form.durationMinutes,
      timeZone: availability.timeZone,
    };
  }

  return {
    status: 'ready',
    proposal: {
      attendeeName: form.attendeeName,
      attendeeEmail: form.attendeeEmail,
      date: form.selectedDate,
      durationMinutes: form.durationMinutes,
      timeZone: availability.timeZone,
      slots,
      selectedSlots: slots.slice(0, Math.min(3, slots.length)),
      brief: {
        type: draft.brief?.type || 'Meeting',
        goal: draft.brief?.goal || '',
        message: draft.brief?.message || '',
        questions: Array.isArray(draft.brief?.questions) ? draft.brief.questions : [],
      },
    },
    calendarsChecked: availability.calendarsChecked,
  };
}

async function prepareForMeeting(userId, args = {}) {
  const meetingId = Number(args.meetingId);
  if (!Number.isInteger(meetingId)) throw new HttpError(400, 'Valid meeting ID required');

  const result = await pool.query(
    `SELECT id, attendee_email, attendee_name, meeting_type, meeting_goal, invite_message,
            qualification_questions, guest_answers, internal_notes, duration_minutes,
            selected_slot, status, created_at, follow_up_count, outcome_next_step,
            outcome_notes, meeting_notes, memory_summary, memory_key_points, memory_decisions
     FROM meetings
     WHERE id = $1 AND user_id = $2`,
    [meetingId, userId]
  );
  const meeting = result.rows[0];
  if (!meeting) throw new HttpError(404, 'Meeting not found');
  if (meeting.status !== 'confirmed') throw new HttpError(409, 'Preparation is only available for booked meetings');

  const persistedContext = {
    meetingId: meeting.id,
    attendeeEmail: meeting.attendee_email || '',
    attendeeName: meeting.attendee_name || '',
    meetingType: meeting.meeting_type || 'Meeting',
    meetingGoal: meeting.meeting_goal || '',
    inviteMessage: meeting.invite_message || '',
    qualificationQuestions: Array.isArray(meeting.qualification_questions) ? meeting.qualification_questions : [],
    guestAnswers: Array.isArray(meeting.guest_answers) ? meeting.guest_answers : [],
    internalNotes: meeting.internal_notes || '',
    durationMinutes: meeting.duration_minutes || 60,
    selectedSlot: meeting.selected_slot,
    status: meeting.status,
    createdAt: meeting.created_at,
    followUpCount: Number(meeting.follow_up_count || 0),
    outcomeNextStep: meeting.outcome_next_step || '',
    outcomeNotes: meeting.outcome_notes || '',
    notes: meeting.meeting_notes || '',
    memorySummary: meeting.memory_summary || '',
    memoryKeyPoints: Array.isArray(meeting.memory_key_points) ? meeting.memory_key_points : [],
    memoryDecisions: Array.isArray(meeting.memory_decisions) ? meeting.memory_decisions : [],
  };

  const brief = await generateWorkflowArtifact({
    kind: 'pre_call',
    context: { persistedContext },
  });

  return { meeting: mapMeeting(meeting), brief };
}

async function executeAgentTool({ name, args, userId }) {
  if (name === 'list_meetings') return listMeetings(userId, args);
  if (name === 'list_open_tasks') return listOpenTasks(userId);
  if (name === 'find_person') return findPerson(userId, args);
  if (name === 'prepare_schedule') return prepareSchedule(userId, args);
  if (name === 'prepare_for_meeting') return prepareForMeeting(userId, args);
  throw new HttpError(400, `Unsupported agent tool: ${name}`);
}

module.exports = {
  AGENT_TOOLS,
  executeAgentTool,
  _test: { missingScheduleFields },
};
