export const EMPTY_INTEGRATION_STATUS = {
  google: { calendarConnected: false, mailSendEnabled: false },
  outlook: { calendarConnected: false, mailSendEnabled: false },
};

export function getConnectionCopy(provider, status = {}) {
  const connected = Boolean(status.calendarConnected);
  const mailEnabled = Boolean(status.mailSendEnabled);
  const providerName = provider === 'google' ? 'Google Calendar' : 'Outlook Calendar';
  const mailName = provider === 'google' ? 'Gmail' : 'Outlook Mail';

  return {
    providerName,
    stateLabel: connected ? 'Connected' : 'Not connected',
    actionLabel: connected ? 'Reconnect' : `Connect ${providerName}`,
    detail: connected
      ? `${providerName} is active${mailEnabled ? ` · ${mailName} sending enabled` : ` · ${mailName} sending needs permission`}`
      : `Connect ${providerName} to use it for availability and meeting holds.`,
    connected,
    mailEnabled,
  };
}
