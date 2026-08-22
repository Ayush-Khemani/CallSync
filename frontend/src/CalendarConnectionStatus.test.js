import { getConnectionCopy } from './CalendarConnectionStatus';

describe('calendar connection status copy', () => {
  test('shows connected Google state with Gmail sending', () => {
    expect(getConnectionCopy('google', { calendarConnected: true, mailSendEnabled: true })).toEqual(expect.objectContaining({
      providerName: 'Google Calendar',
      stateLabel: 'Connected',
      actionLabel: 'Reconnect',
      connected: true,
      mailEnabled: true,
    }));
  });

  test('shows an explicit connect action when Outlook is disconnected', () => {
    expect(getConnectionCopy('outlook', { calendarConnected: false, mailSendEnabled: false })).toEqual(expect.objectContaining({
      providerName: 'Outlook Calendar',
      stateLabel: 'Not connected',
      actionLabel: 'Connect Outlook Calendar',
      connected: false,
    }));
  });

  test('distinguishes calendar connection from missing mail permission', () => {
    const copy = getConnectionCopy('google', { calendarConnected: true, mailSendEnabled: false });
    expect(copy.stateLabel).toBe('Connected');
    expect(copy.detail).toContain('Gmail sending needs permission');
  });
});
