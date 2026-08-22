import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { EMPTY_INTEGRATION_STATUS, getConnectionCopy } from './calendarConnectionStatusLogic';
import './CalendarConnectionStatus.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function beginOAuth(provider) {
  const isGoogle = provider === 'google';
  const clientId = isGoogle
    ? process.env.REACT_APP_GOOGLE_CLIENT_ID
    : process.env.REACT_APP_OUTLOOK_CLIENT_ID;
  if (!clientId) return false;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/${provider}`,
    response_type: 'code',
    scope: isGoogle
      ? 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'
      : 'Calendars.ReadWrite Mail.Send offline_access',
    ...(isGoogle ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' } : { prompt: 'consent' }),
  });

  window.location.href = isGoogle
    ? `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  return true;
}

function ProviderStatus({ provider, status, onConnect }) {
  const copy = getConnectionCopy(provider, status);
  return (
    <article className={`calendar-connection-provider ${copy.connected ? 'is-connected' : 'is-disconnected'}`}>
      <div className="calendar-connection-provider-head">
        <span className="calendar-provider-mark" aria-hidden="true">{provider === 'google' ? 'G' : 'O'}</span>
        <div>
          <strong>{copy.providerName}</strong>
          <span className={`calendar-connection-badge ${copy.connected ? 'connected' : 'disconnected'}`}>
            <i aria-hidden="true" />{copy.stateLabel}
          </span>
        </div>
      </div>
      <p>{copy.detail}</p>
      <button type="button" className="calendar-connection-action" onClick={() => onConnect(provider)}>
        {copy.actionLabel}
      </button>
    </article>
  );
}

export default function CalendarConnectionStatus() {
  const [status, setStatus] = useState(EMPTY_INTEGRATION_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    setLoading(true);
    try {
      setError('');
      const response = await axios.get(`${API_URL}/api/integrations/status`, { headers: authHeaders() });
      setStatus(response.data || EMPTY_INTEGRATION_STATUS);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not refresh calendar connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    window.addEventListener('focus', loadStatus);
    return () => window.removeEventListener('focus', loadStatus);
  }, [loadStatus]);

  if (!localStorage.getItem('token')) return null;

  function connect(provider) {
    if (!beginOAuth(provider)) {
      setError(`${provider === 'google' ? 'Google' : 'Outlook'} OAuth is not configured for this deployment.`);
    }
  }

  return (
    <aside className="calendar-connection-dock" aria-label="Calendar connection status">
      <div className="calendar-connection-dock-head">
        <div>
          <span>Calendar connections</span>
          <strong>{loading ? 'Checking…' : 'Live status'}</strong>
        </div>
        <button type="button" onClick={loadStatus} disabled={loading} aria-label="Refresh calendar connection status">
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      <div className="calendar-connection-providers">
        <ProviderStatus provider="google" status={status.google} onConnect={connect} />
        <ProviderStatus provider="outlook" status={status.outlook} onConnect={connect} />
      </div>
      {error && <p className="calendar-connection-error" role="status">{error}</p>}
    </aside>
  );
}
