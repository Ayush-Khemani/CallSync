const assert = require('node:assert/strict');

const agentRoutes = require('../src/routes/agentRoutes')._test;
const agentTools = require('../src/services/agentTools')._test;
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

assert.deepEqual(
  orchestrator.parseArguments('{"status":"confirmed"}'),
  { status: 'confirmed' }
);
assert.deepEqual(orchestrator.parseArguments('not-json'), {});

assert.deepEqual(
  orchestrator.uiPayloadForTool('list_open_tasks', { tasks: [{ actionId: 1 }] }),
  { type: 'tasks', items: [{ actionId: 1 }] }
);

assert.deepEqual(
  orchestrator.uiPayloadForTool('prepare_schedule', { status: 'ready', proposal }),
  { type: 'schedule_confirmation', proposal }
);

console.log('agent orchestrator tests passed');
