import { render, screen } from '@testing-library/react';
import App, { getFollowUpRisk, getMeetingActionState, getMeetingPipelineStages } from './App';

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
