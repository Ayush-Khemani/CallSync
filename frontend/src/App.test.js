import { render, screen } from '@testing-library/react';
import App, { MEETING_TEMPLATES, buildMeetingDraftFromPrompt, getFollowUpRisk, getMeetingActionState, getMeetingPipelineStages, getPipelineEmptyState, inferMeetingTemplate } from './App';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
    Routes: ({ children }) => <div>{React.Children.toArray(children)[0]}</div>,
    Route: ({ element }) => element,
    useNavigate: () => jest.fn(),
  };
}, { virtual: true });

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}), { virtual: true });

test('renders CallSync landing page', () => {
  render(<App />);
  const linkElement = screen.getByRole('heading', { name: /Send fewer links/i });
  expect(linkElement).toBeInTheDocument();
});

test('groups meetings into pipeline stages', () => {
  const now = Date.now();
  const meetings = [
    { id: 1, status: 'pending', createdAt: new Date(now - 3 * 86400000).toISOString() },
    { id: 2, status: 'pending', createdAt: new Date(now).toISOString() },
    { id: 3, status: 'confirmed', createdAt: new Date(now).toISOString() },
    { id: 4, status: 'cancelled', createdAt: new Date(now).toISOString() },
  ];

  const stages = getMeetingPipelineStages(meetings);

  expect(stages.map((stage) => [stage.label, stage.meetings.map((meeting) => meeting.id)])).toEqual([
    ['Needs follow-up', [1]],
    ['Link sent', [2]],
    ['Booked', [3]],
    ['Closed', [4]],
  ]);
});

test('scores pending invite follow-up risk', () => {
  const now = Date.now();

  expect(getFollowUpRisk({ status: 'pending', createdAt: new Date(now).toISOString() })).toMatchObject({
    level: 'low',
    label: 'Healthy invite',
  });
  expect(getFollowUpRisk({ status: 'pending', createdAt: new Date(now - 2 * 86400000).toISOString() })).toMatchObject({
    level: 'medium',
    label: 'Follow-up due',
  });
  expect(getFollowUpRisk({ status: 'pending', createdAt: new Date(now - 5 * 86400000).toISOString() })).toMatchObject({
    level: 'high',
    label: 'High follow-up risk',
  });
  expect(getFollowUpRisk({ status: 'confirmed', createdAt: new Date(now - 5 * 86400000).toISOString() })).toMatchObject({
    level: 'none',
  });
});

test('surfaces unconfirmed request email delivery immediately', () => {
  const now = Date.now();
  const meeting = {
    id: 11,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    requestEmailSentAt: null,
  };

  expect(getFollowUpRisk(meeting, now)).toMatchObject({
    level: 'high',
    label: 'Email delivery unconfirmed',
  });
  expect(getFollowUpRisk(meeting, now).detail).toContain('Copy the booking link');

  const stages = getMeetingPipelineStages([meeting]);
  expect(stages.find((stage) => stage.id === 'followUp').meetings.map((item) => item.id)).toEqual([11]);
  expect(stages.find((stage) => stage.id === 'pending').meetings).toEqual([]);
});

test('keeps host meeting actions explicit by status', () => {
  expect(getMeetingActionState({ status: 'pending' })).toMatchObject({
    canCancel: true,
    openLabel: 'Open booking page',
    copyLabel: 'Copy booking link',
    cancelLabel: 'Cancel invite',
  });

  expect(getMeetingActionState({ status: 'cancelled' })).toMatchObject({
    canCancel: false,
    openLabel: 'View closed link',
    cancelLabel: 'Cancelled',
  });
});

test('explains empty pipeline stages', () => {
  expect(getPipelineEmptyState('followUp')).toMatchObject({
    title: 'No follow-ups due',
  });
  expect(getPipelineEmptyState('pending').detail).toContain('Freshly sent booking links');
  expect(getPipelineEmptyState('all')).toMatchObject({
    title: 'Your meeting pipeline is empty',
  });
});

test('builds a meeting draft from natural language', () => {
  const draft = buildMeetingDraftFromPrompt(
    'Create a 45 minute investor intro with Maya Chen maya@northstar.vc tomorrow afternoon and ask about decision process',
    { now: new Date('2026-08-14T09:00:00') },
  );

  expect(draft.templateKey).toBe('investor');
  expect(draft.formPatch).toMatchObject({
    attendeeEmail: 'maya@northstar.vc',
    attendeeName: 'Maya Chen',
    selectedDate: '2026-08-15',
    durationMinutes: 45,
    bufferMinutes: 15,
    workStartHour: 13,
    workEndHour: 17,
  });
  expect(draft.brief.type).toBe('Investor meeting');
  expect(draft.brief.questions).toContain('Who is involved in the decision?');
  expect(draft.insights).toContain('Afternoon window');
});

test('keeps production meeting templates distinct and actionable', () => {
  expect(Object.keys(MEETING_TEMPLATES)).toEqual(['founder', 'investor', 'recruiting', 'client']);

  Object.values(MEETING_TEMPLATES).forEach((template) => {
    expect(template.summary.length).toBeGreaterThan(35);
    expect(template.goal.length).toBeGreaterThan(70);
    expect(template.questions).toHaveLength(4);
    expect(template.message.length).toBeGreaterThan(90);
  });

  expect(new Set(Object.values(MEETING_TEMPLATES).map((template) => template.type)).size).toBe(4);
  expect(MEETING_TEMPLATES.recruiting.questions).toContain('What compensation range should we be aware of?');
  expect(MEETING_TEMPLATES.client.questions).toContain('What constraints should we know before the kickoff?');
});

test('routes common production prompts to the right template', () => {
  expect(inferMeetingTemplate('warm VC fund intro')).toBe('investor');
  expect(inferMeetingTemplate('hiring screen with senior backend candidate')).toBe('recruiting');
  expect(inferMeetingTemplate('client scope and stakeholder kickoff')).toBe('client');
  expect(inferMeetingTemplate('founder discovery for a sales lead')).toBe('founder');
});
