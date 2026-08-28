import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ActionsView from './ActionsView';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}), { virtual: true });

const meeting = {
  id: 7,
  attendeeName: 'Maya Chen',
  attendeeEmail: 'maya@example.com',
  meetingType: 'Investor meeting',
  status: 'confirmed',
};

const openAction = {
  actionId: 3,
  meetingId: 7,
  title: 'Send the updated investor deck',
  dueAt: null,
  status: 'open',
  source: 'outcome',
  attendeeName: 'Maya Chen',
  attendeeEmail: 'maya@example.com',
  meetingType: 'Investor meeting',
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.post.mockReset();
  axios.patch.mockReset();
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/actions?status=all')) return Promise.resolve({ data: { actions: [openAction] } });
    if (url.endsWith('/api/meetings')) return Promise.resolve({ data: { meetings: [meeting] } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(() => localStorage.clear());

test('shows meeting commitments with a direct link to their meeting record', async () => {
  render(<ActionsView />);

  await waitFor(() => expect(screen.getByText('Send the updated investor deck')).toBeInTheDocument());
  expect(screen.getByText('Maya Chen')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Send the updated investor deck/i })).toHaveAttribute('href', '/meeting/7');
  expect(screen.getByText('From meeting outcome')).toBeInTheDocument();
});

test('completes and reopens actions from the action ledger', async () => {
  axios.patch.mockResolvedValueOnce({ data: { action: { ...openAction, status: 'completed', completedAt: '2026-08-28T08:00:00.000Z' } } });
  axios.patch.mockResolvedValueOnce({ data: { action: { ...openAction, status: 'open', completedAt: null } } });

  render(<ActionsView />);
  await waitFor(() => expect(screen.getByText('Send the updated investor deck')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /Complete Send the updated investor deck/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Reopen Send the updated investor deck/i })).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /Reopen Send the updated investor deck/i }));
  await waitFor(() => expect(axios.patch).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/actions/3'),
    { status: 'open' },
    expect.objectContaining({ headers: expect.any(Object) })
  ));
});

test('creates a manual action attached to a meeting', async () => {
  axios.post.mockResolvedValue({ data: { action: {
    actionId: 9,
    meetingId: 7,
    title: 'Ask for the partner meeting date',
    dueAt: null,
    status: 'open',
    source: 'manual',
  } } });

  render(<ActionsView />);
  await waitFor(() => expect(screen.getByText('Send the updated investor deck')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText('Meeting'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'Ask for the partner meeting date' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add action' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/meetings/7/actions'),
    expect.objectContaining({ title: 'Ask for the partner meeting date', dueAt: null }),
    expect.objectContaining({ headers: expect.any(Object) })
  ));
  await waitFor(() => expect(screen.getByText('Ask for the partner meeting date')).toBeInTheDocument());
});
