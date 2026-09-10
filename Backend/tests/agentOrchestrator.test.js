const assert = require('node:assert/strict');

const agentRoutes = require('../src/routes/agentRoutes')._test;
const agentTools = require('../src/services/agentTools')._test;
const agentActionTools = require('../src/services/agentActionTools')._test;
const agentAvailability = require('../src/services/agentAvailabilityService')._test;
const followUpService = require('../src/services/followUpService')._test;
const orchestrator = require('../src/services/agentOrchestratorService')._test;

assert.deepEqual(
  agentTools.missingScheduleFields({
    formPatch: { attendeeName: 'Maya', attendeeEmail: '', selectedDate: '' },
  }),
  ['guest email', 'date']
);

const proposal = {
  attendeeName: 'Maya Chen',
  attendeeEmail: 'maya@example.com',
  durationMinutes: 30,
  selectedSlots: ['2026-09-15T13:00:00.000Z'],
  slots: ['2026-09-15T13:00:00.000Z', '2026-09-15T14:00:00.000Z'],
  timeZone: 'Europe/Budapest',
  date: '2026-09-15',
  brief: {
    type: 'Investor meeting',
    goal: 'Discuss the round',
    message: 'Pick a time',
    questions: ['What should we cover?'],
  },
};

const actionPayload = agentRoutes.actionPayloadFromProposal(proposal);
assert.equal(actionPayload.attendeeEmail, 'maya@example.com');
assert.deepEqual(actionPayload.slots, ['2026-09-15T13:00:00.000Z']);
assert.deepEqual(actionPayload.offeredSlots, proposal.slots);

assert.deepEqual(
  agentRoutes.validateSelectedSlots(
    ['2026-09-15T14:00:00.000Z'],
    proposal.slots
  ),
  ['2026-09-15T14:00:00.000Z']
);

assert.throws(
  () => agentRoutes.validateSelectedSlots(
    ['2026-09-16T10:00:00.000Z'],
    proposal.slots
  ),
  /Selected times must come from the agent proposal/
);

assert.equal(
  agentRoutes.validateSelectedSlot('2026-09-15T14:00:00.000Z', proposal.slots),
  '2026-09-15T14:00:00.000Z'
);
assert.throws(
  () => agentRoutes.validateSelectedSlot('2026-09-16T10:00:00.000Z', proposal.slots),
  /Selected time must come from the agent proposal/
);

assert.deepEqual(
  agentRoutes.pendingActionForPayload({ type: 'schedule_confirmation', proposal }),
  { actionType: 'create_meeting', payload: actionPayload }
);
assert.equal(
  agentRoutes.pendingActionForPayload({ type: 'follow_up_confirmation', proposal: { meetingId: 7 } }).actionType,
  'send_follow_up'
);
assert.equal(
  agentRoutes.pendingActionForPayload({ type: 'cancel_confirmation', proposal: { meetingId: 7 } }).actionType,
  'cancel_meeting'
);
assert.equal(
  agentRoutes.pendingActionForPayload({ type: 'reschedule_confirmation', proposal: { meetingId: 7 } }).actionType,
  'reschedule_meeting'
);
assert.equal(agentRoutes.pendingActionForPayload({ type: 'tasks' }), null);

assert.equal(agentRoutes.assertAllowedProvider('google', ['google', 'outlook']), 'google');
assert.throws(
  () => agentRoutes.assertAllowedProvider('outlook', ['google']),
  /Sending mailbox must come from the original agent proposal/
);

assert.equal(agentActionTools.validMeetingId(7), 7);
assert.throws(() => agentActionTools.validMeetingId('bad'), /Valid meeting ID required/);

const events = [{ id: 'keep' }, { id: 'ignore' }, { id: 'also-keep' }];
assert.deepEqual(agentAvailability.withoutEvent(events, 'ignore'), [{ id: 'keep' }, { id: 'also-keep' }]);
assert.deepEqual(agentAvailability.withoutEvent(events, null), events);

assert.equal(followUpService.cleanSubject('Hello\nInjected', 'Meeting'), 'Hello Injected');
assert.equal(followUpService.requireProvider('google'), 'google');
assert.throws(() => followUpService.requireProvider('smtp'), /Choose Google or Outlook/);

assert.deepEqual(orchestrator.parseArguments('{"status":"confirmed"}'), { status: 'confirmed' });
assert.deepEqual(orchestrator.parseArguments('not-json'), {});

assert.deepEqual(
  orchestrator.uiPayloadForTool('list_open_tasks', { tasks: [{ actionId: 1 }] }),
  { type: 'tasks', items: [{ actionId: 1 }] }
);
assert.deepEqual(
  orchestrator.uiPayloadForTool('prepare_schedule', { status: 'ready', proposal }),
  { type: 'schedule_confirmation', proposal }
);
assert.deepEqual(
  orchestrator.uiPayloadForTool('prepare_follow_up', { status: 'ready', proposal: { meetingId: 7 } }),
  { type: 'follow_up_confirmation', proposal: { meetingId: 7 } }
);
assert.deepEqual(
  orchestrator.uiPayloadForTool('prepare_cancellation', { status: 'ready', proposal: { meetingId: 7 } }),
  { type: 'cancel_confirmation', proposal: { meetingId: 7 } }
);
assert.deepEqual(
  orchestrator.uiPayloadForTool('prepare_reschedule', { status: 'ready', proposal: { meetingId: 7 } }),
  { type: 'reschedule_confirmation', proposal: { meetingId: 7 } }
);
assert.deepEqual(
  orchestrator.uiPayloadForTool('update_task_status', {
    message: 'Task completed',
    action: { actionId: 2, status: 'completed', title: 'Send deck' },
  }),
  {
    type: 'task_update',
    action: { actionId: 2, status: 'completed', title: 'Send deck' },
    message: 'Task completed',
  }
);

console.log('agent orchestrator tests passed');
