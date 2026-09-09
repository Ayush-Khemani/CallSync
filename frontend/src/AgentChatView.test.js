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

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.post.mockReset();

  axios.post.mockImplementation((url) => {
    if (url.includes('/api/intelligence/generate')) {
      return Promise.resolve({
        data: {
          output: {
            formPatch: {
              attendeeEmail: 'maya@example.com',
              attendeeName: 'Maya Chen',
              selectedDate: '2026-09-15',
              durationMinutes: 30,
              bufferMinutes: 15,
              slotIntervalMinutes: 30,
              workStartHour: 13,
              workEndHour: 17,
            },
            brief: {
              type: 'Investor meeting',
              goal: 'Discuss the round.',
              questions: ['What should we cover?'],
              message: 'Pick a time that works.',
            },
          },
        },
      });
    }

    if (url.includes('/api/meetings/create')) {
      return Promise.resolve({
        data: {
          uniqueLink: 'agent-meeting-link',
          delivery: { requestEmail: { sent: true } },
        },
      });
    }

    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  axios.get.mockImplementation((url) => {
    if (url.includes('/api/calendar/available-slots')) {
      return Promise.resolve({
        data: {
          availableSlots: [
            '2026-09-15T13:00:00.000Z',
            '2026-09-15T14:00:00.000Z',
            '2026-09-15T15:00:00.000Z',
          ],
          timeZone: 'Europe/Budapest',
        },
      });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(() => localStorage.clear());

test('schedules through chat with explicit confirmation before creating the meeting', async () => {
  render(<AgentChatView />);

  fireEvent.change(screen.getByLabelText('Ask CallSync'), {
    target: { value: 'Schedule 30 minutes with Maya Chen at maya@example.com next week in the afternoon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/intelligence/generate'),
    expect.objectContaining({ kind: 'meeting_brief' }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));

  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/calendar/available-slots'),
    expect.objectContaining({
      params: expect.objectContaining({ date: '2026-09-15', durationMinutes: 30 }),
      headers: expect.any(Object),
    })
  ));

  const confirm = await screen.findByRole('button', { name: 'Send meeting request' });
  expect(axios.post.mock.calls.filter(([url]) => url.includes('/api/meetings/create'))).toHaveLength(0);

  fireEvent.click(confirm);

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/meetings/create'),
    expect.objectContaining({
      attendeeEmail: 'maya@example.com',
      attendeeName: 'Maya Chen',
      durationMinutes: 30,
      slots: expect.arrayContaining(['2026-09-15T13:00:00.000Z']),
    }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));

  await waitFor(() => expect(screen.getByText(/Done. I created the meeting with Maya Chen/i)).toBeInTheDocument());
});
