import { buildRelationships } from './relationshipWorkflow';

const NOW = new Date('2026-08-28T10:00:00.000Z').getTime();

const meetings = [
  {
    id: 1,
    attendeeName: 'Maya Chen',
    attendeeEmail: 'MAYA@northstar.vc',
    meetingType: 'Investor meeting',
    meetingGoal: 'Introduce the company.',
    status: 'confirmed',
    selectedSlot: '2026-06-11T12:00:00.000Z',
    createdAt: '2026-06-01T12:00:00.000Z',
  },
  {
    id: 2,
    attendeeName: 'Maya Chen',
    attendeeEmail: 'maya@northstar.vc',
    meetingType: 'Investor follow-up',
    meetingGoal: 'Discuss the seed round.',
    status: 'confirmed',
    selectedSlot: '2026-08-25T12:00:00.000Z',
    createdAt: '2026-08-20T12:00:00.000Z',
  },
  {
    id: 3,
    attendeeName: 'Jamie Smith',
    attendeeEmail: 'jamie@example.com',
    meetingType: 'Customer discovery',
    status: 'pending',
    createdAt: '2026-08-27T12:00:00.000Z',
  },
  {
    id: 4,
    attendeeName: 'Ignored Person',
    attendeeEmail: 'ignored@example.com',
    status: 'cancelled',
    createdAt: '2026-08-27T12:00:00.000Z',
  },
];

const outcomes = [
  { meetingId: 2, nextStep: 'Send updated revenue metrics.', recordedAt: '2026-08-25T13:00:00.000Z' },
];

const memories = [
  { meetingId: 2, summary: 'Maya wants updated retention and revenue before the partner meeting.' },
];

const actions = [
  { actionId: 8, meetingId: 2, title: 'Send updated revenue metrics', dueAt: '2026-08-29T09:00:00.000Z', status: 'open' },
  { actionId: 9, meetingId: 1, title: 'Old completed task', status: 'completed' },
];

test('groups repeated meetings by normalized attendee email and carries latest context plus open commitments', () => {
  const relationships = buildRelationships(meetings, outcomes, memories, actions, NOW);

  expect(relationships).toHaveLength(2);
  const maya = relationships.find((item) => item.email === 'maya@northstar.vc');

  expect(maya.attendeeName).toBe('Maya Chen');
  expect(maya.meetingCount).toBe(2);
  expect(maya.bookedCount).toBe(2);
  expect(maya.latestMeetingId).toBe(2);
  expect(maya.latestMeetingType).toBe('Investor follow-up');
  expect(maya.latestContext).toBe('Maya wants updated retention and revenue before the partner meeting.');
  expect(maya.openActionCount).toBe(1);
  expect(maya.nextAction.title).toBe('Send updated revenue metrics');
  expect(maya.relationshipState).toBe('active');
});

test('treats pending invites as active relationships and excludes cancelled-only people', () => {
  const relationships = buildRelationships(meetings, outcomes, memories, actions, NOW);
  const jamie = relationships.find((item) => item.email === 'jamie@example.com');

  expect(jamie.pendingCount).toBe(1);
  expect(jamie.relationshipState).toBe('active');
  expect(relationships.some((item) => item.email === 'ignored@example.com')).toBe(false);
});
