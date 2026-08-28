import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import RelationshipsView from './RelationshipsView';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}), { virtual: true });

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/meetings')) return Promise.resolve({ data: { meetings: [
      { id: 1, attendeeName: 'Maya Chen', attendeeEmail: 'maya@northstar.vc', meetingType: 'Investor intro', meetingGoal: 'Introduce the company.', status: 'confirmed', selectedSlot: '2026-06-11T12:00:00.000Z', createdAt: '2026-06-01T12:00:00.000Z' },
      { id: 2, attendeeName: 'Maya Chen', attendeeEmail: 'MAYA@northstar.vc', meetingType: 'Investor follow-up', meetingGoal: 'Discuss the seed round.', status: 'confirmed', selectedSlot: '2026-08-25T12:00:00.000Z', createdAt: '2026-08-20T12:00:00.000Z' },
      { id: 3, attendeeName: 'Jamie Smith', attendeeEmail: 'jamie@example.com', meetingType: 'Customer discovery', status: 'pending', createdAt: '2026-08-27T12:00:00.000Z' },
    ] } });
    if (url.includes('/api/meetings/outcome-state')) return Promise.resolve({ data: { outcomes: [{ meetingId: 2, nextStep: 'Send metrics.' }] } });
    if (url.includes('/api/meetings/memory-state')) return Promise.resolve({ data: { memories: [{ meetingId: 2, summary: 'Maya wants updated retention before the partner meeting.' }] } });
    if (url.includes('/api/actions?status=all')) return Promise.resolve({ data: { actions: [{ actionId: 8, meetingId: 2, title: 'Send updated revenue metrics', status: 'open', dueAt: null }] } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(() => localStorage.clear());

test('renders one relationship for repeated meetings and links to the latest record', async () => {
  render(<RelationshipsView />);

  await waitFor(() => expect(screen.getByText('Maya Chen')).toBeInTheDocument());
  expect(screen.getByText('Maya wants updated retention before the partner meeting.')).toBeInTheDocument();
  expect(screen.getByText('Send updated revenue metrics')).toBeInTheDocument();
  expect(screen.getByText(/Investor follow-up/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open latest meeting/i })).toHaveAttribute('href', '/meeting/2');
});

test('searches relationships by name or context', async () => {
  render(<RelationshipsView />);
  await waitFor(() => expect(screen.getByText('Maya Chen')).toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText(/Search person/i), { target: { value: 'Jamie' } });
  expect(screen.getByText('Jamie Smith')).toBeInTheDocument();
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument();
});
