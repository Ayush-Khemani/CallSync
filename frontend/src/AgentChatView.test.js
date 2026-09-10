import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AgentChatView from './AgentChatView';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}), { virtual: true });

const scheduleProposal = {
  attendeeName: 'Maya Chen', attendeeEmail: 'maya@example.com', date: '2026-09-15',
  durationMinutes: 30, timeZone: 'Europe/Budapest',
  slots: ['2026-09-15T13:00:00.000Z', '2026-09-15T14:00:00.000Z'],
  selectedSlots: ['2026-09-15T13:00:00.000Z'],
  brief: { type: 'Investor meeting', goal: 'Discuss the round', message: 'Pick a time', questions: [] },
};

function chatResponse(payload, content = 'Ready for you to review.') {
  return {
    data: {
      thread: { id: 'thread-1', title: 'Agent work' },
      message: { id: Math.random(), role: 'assistant', content, payload },
    },
  };
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.post.mockReset();
  axios.get.mockResolvedValue({ data: { thread: null, messages: [] } });
});

afterEach(() => localStorage.clear());

async function send(text) {
  fireEvent.change(screen.getByLabelText('Ask CallSync'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

test('uses the server agent for scheduling and confirms through the durable action endpoint', async () => {
  axios.post.mockImplementation((url) => {
    if (url.includes('/api/agent/chat')) return Promise.resolve(chatResponse({ type: 'schedule_confirmation', actionId: 'schedule-1', proposal: scheduleProposal }));
    if (url.includes('/api/agent/actions/schedule-1/confirm')) return Promise.resolve(chatResponse({ type: 'created', actionId: 'schedule-1', completed: true, meetingId: 7, meetingName: 'Maya Chen', uniqueLink: 'agent-meeting-link', sent: true }, 'Done. I created the meeting with Maya Chen and sent the request.'));
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  render(<AgentChatView />);
  await send('Schedule 30 minutes with Maya Chen at maya@example.com next week');

  const confirm = await screen.findByRole('button', { name: 'Send meeting request' });
  expect(axios.post.mock.calls.some(([url]) => url.includes('/api/intelligence/generate'))).toBe(false);
  expect(axios.get.mock.calls.some(([url]) => url.includes('/api/calendar/available-slots'))).toBe(false);

  fireEvent.click(confirm);
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/agent/actions/schedule-1/confirm'),
    expect.objectContaining({ selectedSlots: ['2026-09-15T13:00:00.000Z'] }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));
  expect(await screen.findByText('Request sent')).toBeInTheDocument();
});

test('lets the user edit a follow-up before approving mailbox delivery', async () => {
  const proposal = {
    meetingId: 7, attendeeName: 'Maya Chen', attendeeEmail: 'maya@example.com',
    meetingType: 'Investor meeting', subject: 'Following up: Investor meeting',
    message: 'Hi Maya — following up on our meeting.', provider: 'google',
    availableProviders: ['google', 'outlook'], nextFollowUpAt: null,
  };
  axios.post.mockImplementation((url, body) => {
    if (url.includes('/api/agent/chat')) return Promise.resolve(chatResponse({ type: 'follow_up_confirmation', actionId: 'follow-1', proposal }));
    if (url.includes('/api/agent/actions/follow-1/confirm')) {
      expect(body.provider).toBe('outlook');
      expect(body.message).toBe('Hi Maya — quick follow-up from CallSync.');
      return Promise.resolve(chatResponse({ type: 'follow_up_sent', actionId: 'follow-1', completed: true, meetingId: 7, attendeeName: 'Maya Chen', provider: 'outlook', sent: true }, 'Done. I sent the follow-up to Maya Chen through Outlook.'));
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  render(<AgentChatView />);
  await send('Follow up with Maya');

  await screen.findByRole('button', { name: 'Send follow-up' });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: 'outlook' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi Maya — quick follow-up from CallSync.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }));

  expect(await screen.findByText('Follow-up sent')).toBeInTheDocument();
  expect(screen.getAllByText('Outlook').length).toBeGreaterThan(0);
});

test('requires explicit confirmation before cancellation', async () => {
  axios.post.mockImplementation((url) => {
    if (url.includes('/api/agent/chat')) return Promise.resolve(chatResponse({
      type: 'cancel_confirmation', actionId: 'cancel-1',
      proposal: { meetingId: 9, attendeeName: 'Sam Lee', attendeeEmail: 'sam@example.com', meetingType: 'Catch-up', status: 'confirmed', selectedSlot: '2026-09-16T11:00:00.000Z' },
    }));
    if (url.includes('/api/agent/actions/cancel-1/confirm')) return Promise.resolve(chatResponse({ type: 'cancelled', actionId: 'cancel-1', completed: true, meetingId: 9, attendeeName: 'Sam Lee', cleanupComplete: true }, 'Done. I cancelled the meeting with Sam Lee.'));
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  render(<AgentChatView />);
  await send('Cancel my meeting with Sam');
  const confirm = await screen.findByRole('button', { name: 'Cancel meeting' });
  expect(axios.post.mock.calls.filter(([url]) => url.includes('/confirm'))).toHaveLength(0);
  fireEvent.click(confirm);
  expect(await screen.findByText('Meeting cancelled')).toBeInTheDocument();
});

test('reschedules only after the user approves one proposed time', async () => {
  axios.post.mockImplementation((url, body) => {
    if (url.includes('/api/agent/chat')) return Promise.resolve(chatResponse({
      type: 'reschedule_confirmation', actionId: 'move-1',
      proposal: {
        meetingId: 12, attendeeName: 'Alex Kim', attendeeEmail: 'alex@example.com', meetingType: 'Demo',
        previousSlot: '2026-09-14T10:00:00.000Z', date: '2026-09-17', durationMinutes: 30,
        timeZone: 'Europe/Budapest', slots: ['2026-09-17T13:00:00.000Z', '2026-09-17T14:00:00.000Z'],
        selectedSlot: '2026-09-17T13:00:00.000Z',
      },
    }));
    if (url.includes('/api/agent/actions/move-1/confirm')) {
      expect(body.selectedSlot).toBe('2026-09-17T13:00:00.000Z');
      return Promise.resolve(chatResponse({ type: 'rescheduled', actionId: 'move-1', completed: true, meetingId: 12, attendeeName: 'Alex Kim', previousSlot: '2026-09-14T10:00:00.000Z', selectedSlot: '2026-09-17T13:00:00.000Z' }, 'Done. I moved the meeting with Alex Kim.'));
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  render(<AgentChatView />);
  await send('Move my meeting with Alex to Thursday afternoon');
  fireEvent.click(await screen.findByRole('button', { name: 'Reschedule meeting' }));
  expect(await screen.findByText('Meeting rescheduled')).toBeInTheDocument();
});

test('renders an internal task update without an approval card', async () => {
  axios.post.mockResolvedValueOnce(chatResponse({
    type: 'task_update',
    action: { actionId: 4, meetingId: 7, title: 'Send the deck', status: 'completed' },
    message: 'Task completed',
  }, 'Done. I marked that task complete.'));

  render(<AgentChatView />);
  await send('Mark the send deck task complete');
  expect(await screen.findByText('Task completed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /confirm|complete task/i })).not.toBeInTheDocument();
});

test('restores persistent conversation and completed approval state', async () => {
  axios.get.mockResolvedValueOnce({
    data: {
      thread: { id: 'thread-existing', title: 'My meeting work' },
      messages: [
        { id: 1, role: 'user', content: 'Follow up with Maya', payload: {} },
        { id: 2, role: 'assistant', content: 'Review this follow-up.', payload: { type: 'follow_up_confirmation', actionId: 'done-1', proposal: { meetingId: 7, attendeeName: 'Maya Chen', attendeeEmail: 'maya@example.com', meetingType: 'Meeting', subject: 'Following up', message: 'Hi Maya', provider: 'google', availableProviders: ['google'] } } },
        { id: 3, role: 'assistant', content: 'Done.', payload: { type: 'follow_up_sent', actionId: 'done-1', completed: true, attendeeName: 'Maya Chen', provider: 'google', sent: true } },
      ],
    },
  });

  render(<AgentChatView />);
  await waitFor(() => expect(screen.getByText('Follow up with Maya')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled();
});
