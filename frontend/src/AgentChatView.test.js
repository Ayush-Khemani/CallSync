import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AgentChatView from './AgentChatView';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}), { virtual: true });

const proposal = {
  attendeeName: 'Maya Chen',
  attendeeEmail: 'maya@example.com',
  date: '2026-09-15',
  durationMinutes: 30,
  timeZone: 'Europe/Budapest',
  slots: [
    '2026-09-15T13:00:00.000Z',
    '2026-09-15T14:00:00.000Z',
    '2026-09-15T15:00:00.000Z',
  ],
  selectedSlots: [
    '2026-09-15T13:00:00.000Z',
    '2026-09-15T14:00:00.000Z',
  ],
  brief: {
    type: 'Investor meeting',
    goal: 'Discuss the round',
    message: 'Pick a time that works.',
    questions: ['What should we cover?'],
  },
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.post.mockReset();

  axios.get.mockResolvedValue({
    data: { thread: null, messages: [] },
  });

  axios.post.mockImplementation((url) => {
    if (url.includes('/api/agent/chat')) {
      return Promise.resolve({
        data: {
          thread: { id: 'thread-1', title: 'Schedule with Maya' },
          message: {
            id: 10,
            role: 'assistant',
            content: 'I checked your calendars and prepared the meeting. Confirm before I send anything.',
            payload: {
              type: 'schedule_confirmation',
              actionId: 'action-1',
              proposal,
            },
          },
        },
      });
    }

    if (url.includes('/api/agent/actions/action-1/confirm')) {
      return Promise.resolve({
        data: {
          message: {
            id: 11,
            role: 'assistant',
            content: 'Done. I created the meeting with Maya Chen and sent the request.',
            payload: {
              type: 'created',
              meetingId: 7,
              meetingName: 'Maya Chen',
              uniqueLink: 'agent-meeting-link',
              sent: true,
            },
          },
        },
      });
    }

    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
});

afterEach(() => localStorage.clear());

test('uses the server agent for scheduling and confirms through the durable action endpoint', async () => {
  render(<AgentChatView />);

  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/agent/threads/latest'),
    expect.objectContaining({ headers: expect.any(Object) })
  ));

  fireEvent.change(screen.getByLabelText('Ask CallSync'), {
    target: { value: 'Schedule 30 minutes with Maya Chen at maya@example.com next week' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/agent/chat'),
    expect.objectContaining({
      message: expect.stringContaining('Schedule 30 minutes'),
      timeZone: expect.any(String),
    }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));

  const confirm = await screen.findByRole('button', { name: 'Send meeting request' });

  const directLegacyCalls = axios.post.mock.calls.filter(([url]) => (
    url.includes('/api/intelligence/generate')
    || url.includes('/api/meetings/create')
  ));
  expect(directLegacyCalls).toHaveLength(0);
  expect(axios.get.mock.calls.some(([url]) => url.includes('/api/calendar/available-slots'))).toBe(false);

  fireEvent.click(confirm);

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/agent/actions/action-1/confirm'),
    expect.objectContaining({
      selectedSlots: expect.arrayContaining(['2026-09-15T13:00:00.000Z']),
    }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));

  await waitFor(() => expect(screen.getByText(/Done. I created the meeting with Maya Chen/i)).toBeInTheDocument());
  expect(screen.getByText('Request sent')).toBeInTheDocument();
});

test('restores the latest persistent conversation', async () => {
  axios.get.mockResolvedValueOnce({
    data: {
      thread: { id: 'thread-existing', title: 'My meeting work' },
      messages: [
        { id: 1, role: 'user', content: 'Show my tasks', payload: {} },
        {
          id: 2,
          role: 'assistant',
          content: 'These are your open meeting tasks.',
          payload: {
            type: 'tasks',
            items: [{
              actionId: 4,
              meetingId: 7,
              title: 'Send the deck',
              attendeeName: 'Maya Chen',
              dueAt: null,
            }],
          },
        },
      ],
    },
  });

  render(<AgentChatView />);

  await waitFor(() => expect(screen.getByText('Show my tasks')).toBeInTheDocument());
  expect(screen.getByText('These are your open meeting tasks.')).toBeInTheDocument();
  expect(screen.getByText('Send the deck')).toBeInTheDocument();
});
