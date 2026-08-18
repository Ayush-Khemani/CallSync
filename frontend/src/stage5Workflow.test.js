import { buildPreCallBrief, filterBookedMeetings, getMeetingNextAction, sortByNextAction } from './stage5Workflow';

const NOW = new Date('2026-08-18T12:00:00Z').getTime();

function meeting(overrides = {}) {
  return {
    id: 1,
    status: 'confirmed',
    selectedSlot: '2026-08-19T12:00:00Z',
    meetingType: 'Customer discovery',
    meetingGoal: 'Understand the current workflow and agree whether a technical follow-up makes sense.',
    guestAnswers: [
      { question: 'What problem are you trying to solve?', answer: 'Our team loses track of warm customer meetings after the first reply.' },
    ],
    ...overrides,
  };
}

test('builds a pre-call brief from durable meeting context', () => {
  const brief = buildPreCallBrief(meeting());

  expect(brief.goal).toContain('Understand the current workflow');
  expect(brief.guestContextCount).toBe(1);
  expect(brief.agenda.join(' ')).toContain('warm customer meetings');
  expect(brief.agenda.join(' ')).toContain('decision process');
  expect(brief.openingPrompt).toContain('You mentioned');
});

test('marks upcoming booked meetings for preparation', () => {
  expect(getMeetingNextAction(meeting(), NOW)).toMatchObject({ id: 'prepare', label: 'Prepare' });
});

test('marks past booked meetings without an outcome as outcome due', () => {
  expect(getMeetingNextAction(meeting({ selectedSlot: '2026-08-17T12:00:00Z' }), NOW)).toMatchObject({
    id: 'outcomeDue',
    label: 'Outcome due',
  });
});

test('prioritizes an overdue next action after an outcome', () => {
  expect(getMeetingNextAction(meeting({
    selectedSlot: '2026-08-17T12:00:00Z',
    recordedAt: '2026-08-17T13:00:00Z',
    followUpAt: '2026-08-18T10:00:00Z',
  }), NOW)).toMatchObject({ id: 'nextAction', label: 'Next action due' });
});

test('filters and sorts booked meetings by next action', () => {
  const meetings = [
    meeting({ id: 1, selectedSlot: '2026-08-20T12:00:00Z' }),
    meeting({ id: 2, selectedSlot: '2026-08-17T12:00:00Z' }),
    { id: 3, status: 'pending', selectedSlot: null },
  ];

  expect(filterBookedMeetings(meetings, 'outcomeDue').map((item) => item.id)).toEqual([2]);
  expect(sortByNextAction(meetings.filter((item) => item.status === 'confirmed')).map((item) => item.id)).toEqual([2, 1]);
});
