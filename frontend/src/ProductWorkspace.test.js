import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ProductWorkspace from './ProductWorkspace';
import MeetingRecordPage from './MeetingRecordPage';

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
    patch: jest.fn(),
  },
}), { virtual: true });

jest.mock('./CalendarConnectionStatus', () => () => null);

const meeting = {
  id: 7,
  attendeeName: 'Maya Chen',
  attendeeEmail: 'maya@example.com',
  uniqueLink: 'meeting-link',
  status: 'confirmed',
  createdAt: '2026-08-22T10:00:00.000Z',
  selectedSlot: '2026-08-24T13:00:00.000Z',
  meetingType: 'Investor meeting',
  meetingGoal: 'Discuss fund fit and the next fundraising step.',
  inviteMessage: 'Pick a focused time that works.',
  qualificationQuestions: ['What fund are you with?'],
  guestAnswers: [{ question: 'What fund are you with?', answer: 'Northstar Ventures' }],
  internalNotes: 'Review the current deck.',
  durationMinutes: 30,
  slotCount: 3,
  requestEmailSentAt: '2026-08-22T10:01:00.000Z',
  confirmationAttendeeEmailSentAt: '2026-08-22T10:05:00.000Z',
  confirmationHostEmailSentAt: '2026-08-22T10:05:00.000Z',
};

function mockApi() {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/meetings/follow-up-state')) return Promise.resolve({ data: { followUps: [] } });
    if (url.includes('/api/meetings/outcome-state')) return Promise.resolve({ data: { outcomes: [] } });
    if (url.includes('/api/meetings/memory-state')) return Promise.resolve({ data: { memories: [] } });
    if (url.includes('/api/integrations/status')) return Promise.resolve({ data: { google: { mailSendEnabled: true }, outlook: { mailSendEnabled: true } } });
    if (url.includes('/api/analytics/meeting-lifecycle')) return Promise.resolve({ data: { allTime: { rates: { booking: 100, outcomeCapture: 0 }, outcomesRecorded: 0 } } });
    if (url.endsWith('/api/meetings')) return Promise.resolve({ data: { meetings: [meeting] } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.post.mockReset();
  axios.patch.mockReset();
  mockApi();
});

afterEach(() => {
  localStorage.clear();
});

test('renders a Kanban-only pipeline with meeting cards linking to a dedicated record', async () => {
  render(<ProductWorkspace />);

  expect(screen.getByRole('heading', { name: /Every conversation, one clear next state/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('Maya Chen')).toBeInTheDocument());

  const card = screen.getByRole('link', { name: /Maya Chen/i });
  expect(card).toHaveAttribute('href', '/meeting/7');
  expect(screen.queryByText(/Meeting brief · editable/i)).not.toBeInTheDocument();
});

test('meeting record centralizes overview, preparation, follow-up, outcome, memory and activity navigation', async () => {
  window.history.pushState({}, '', '/meeting/7');
  render(<MeetingRecordPage />);

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Maya Chen' })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Prepare' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Follow-up' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Outcome' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Memory' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
  expect(screen.getByText('Northstar Ventures')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Review the current deck.')).toBeInTheDocument();
});
