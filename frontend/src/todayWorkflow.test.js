import { buildTodayWorkspace, todayAttentionCount } from './todayWorkflow';

const NOW = new Date('2026-08-28T08:00:00.000Z').getTime();

function meeting(overrides) {
  return {
    id: overrides.id,
    status: 'confirmed',
    attendeeName: `Person ${overrides.id}`,
    attendeeEmail: `person${overrides.id}@example.com`,
    createdAt: '2026-08-20T08:00:00.000Z',
    requestEmailSentAt: '2026-08-20T08:01:00.000Z',
    ...overrides,
  };
}

test('builds a daily queue for upcoming meetings, booking follow-ups and missing outcomes', () => {
  const meetings = [
    meeting({ id: 1, selectedSlot: '2026-08-28T12:00:00.000Z' }),
    meeting({ id: 2, status: 'pending', createdAt: '2026-08-24T08:00:00.000Z' }),
    meeting({ id: 3, selectedSlot: '2026-08-27T12:00:00.000Z' }),
    meeting({ id: 4, selectedSlot: '2026-08-20T12:00:00.000Z', recordedAt: '2026-08-20T13:00:00.000Z', followUpAt: '2026-08-27T09:00:00.000Z' }),
    meeting({ id: 5, status: 'cancelled', selectedSlot: '2026-08-28T10:00:00.000Z' }),
  ];

  const workspace = buildTodayWorkspace(meetings, NOW);

  expect(workspace.upcoming.map((item) => item.id)).toEqual([1]);
  expect(workspace.prepare.map((item) => item.id)).toEqual([1]);
  expect(workspace.waiting.map((item) => item.id)).toEqual([2]);
  expect(workspace.followUp.map((item) => item.id)).toEqual([2]);
  expect(workspace.outcomes.map((item) => item.id)).toEqual([3]);
  expect(todayAttentionCount(workspace, 1)).toBe(3);
});

test('does not treat healthy pending requests or future meetings beyond 24 hours as immediate attention', () => {
  const meetings = [
    meeting({ id: 10, status: 'pending', createdAt: '2026-08-27T20:00:00.000Z' }),
    meeting({ id: 11, selectedSlot: '2026-08-30T12:00:00.000Z' }),
  ];

  const workspace = buildTodayWorkspace(meetings, NOW);

  expect(workspace.waiting.map((item) => item.id)).toEqual([10]);
  expect(workspace.followUp).toHaveLength(0);
  expect(workspace.upcoming).toHaveLength(0);
  expect(todayAttentionCount(workspace, 0)).toBe(0);
});
