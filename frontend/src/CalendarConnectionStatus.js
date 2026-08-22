import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

function ProviderStatus({ provider, status, loading, error, onConnect, onRefresh }) {
  const copy = getConnectionCopy(provider, status);
  const stateLabel = loading ? 'Checking…' : error ? 'Status unavailable' : copy.stateLabel;
  const stateClass = loading || error ? 'checking' : copy.connected ? 'connected' : 'disconnected';
  const mailLabel = copy.mailEnabled
    ? 'Enabled'
    : copy.connected
      ? 'Needs permission'
      : 'Unavailable';

  return (
    <div className={`calendar-inline-status ${copy.connected ? 'is-connected' : 'is-disconnected'}`}>
      <div className="calendar-inline-status-head">
        <div>
          <small>Connection status</small>
          <span className={`calendar-connection-badge ${stateClass}`}>
            <i aria-hidden="true" />{stateLabel}
          </span>
        </div>
        <button type="button" className="calendar-inline-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {!error && (
        <div className="calendar-inline-facts">
          <div>
            <span>Calendar sync</span>
            <strong>{copy.connected ? 'Active' : 'Inactive'}</strong>
          </div>
          <div>
            <span>{provider === 'google' ? 'Gmail sending' : 'Outlook Mail'}</span>
            <strong>{mailLabel}</strong>
          </div>
        </div>
      )}

      <p className={error ? 'calendar-inline-error' : ''}>
        {error || copy.detail}
      </p>

      <button type="button" className="calendar-connection-action" onClick={() => onConnect(provider)}>
        {copy.actionLabel}
      </button>
    </div>
  );
}

export default function CalendarConnectionStatus() {
  const [status, setStatus] = useState(EMPTY_INTEGRATION_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targets, setTargets] = useState({ google: null, outlook: null });

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

  useEffect(() => {
    if (!localStorage.getItem('token')) return undefined;

    let previousGoogle = null;
    let previousOutlook = null;

    const syncTargets = () => {
      const google = document.querySelector('.integrations > article.google');
      const outlook = document.querySelector('.integrations > article.outlook');

      if (previousGoogle && previousGoogle !== google) previousGoogle.classList.remove('calendar-status-enhanced');
      if (previousOutlook && previousOutlook !== outlook) previousOutlook.classList.remove('calendar-status-enhanced');
      if (google) google.classList.add('calendar-status-enhanced');
      if (outlook) outlook.classList.add('calendar-status-enhanced');

      const changed = google !== previousGoogle || outlook !== previousOutlook;
      previousGoogle = google;
      previousOutlook = outlook;

      if (changed) {
        setTargets({ google, outlook });
        if (google || outlook) loadStatus();
      }
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (previousGoogle) previousGoogle.classList.remove('calendar-status-enhanced');
      if (previousOutlook) previousOutlook.classList.remove('calendar-status-enhanced');
    };
  }, [loadStatus]);

  if (!localStorage.getItem('token')) return null;

  function connect(provider) {
    if (!beginOAuth(provider)) {
      setError(`${provider === 'google' ? 'Google' : 'Outlook'} OAuth is not configured for this deployment.`);
    }
  }

  return (
    <>
      {targets.google && createPortal(
        <ProviderStatus
          provider="google"
          status={status.google}
          loading={loading}
          error={error}
          onConnect={connect}
          onRefresh={loadStatus}
        />,
        targets.google
      )}
      {targets.outlook && createPortal(
        <ProviderStatus
          provider="outlook"
          status={status.outlook}
          loading={loading}
          error={error}
          onConnect={connect}
          onRefresh={loadStatus}
        />,
        targets.outlook
      )}
    </>
  );
}
