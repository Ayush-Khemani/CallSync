import React from 'react';

export const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

export function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function formatShortDate(value) {
  if (!value) return 'Waiting for guest';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waiting for guest';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Brand() {
  return <a className="pw-brand" href="/"><span>CS</span><strong>CallSync</strong></a>;
}

export function beginOAuth(provider) {
  const isGoogle = provider === 'google';
  const clientId = process.env[isGoogle ? 'REACT_APP_GOOGLE_CLIENT_ID' : 'REACT_APP_OUTLOOK_CLIENT_ID'];
  if (!clientId) return false;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/${provider}`,
    response_type: 'code',
    scope: isGoogle
      ? 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'
      : 'Calendars.ReadWrite Mail.Send offline_access',
    ...(isGoogle
      ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }
      : { prompt: 'consent' }),
  });

  window.location.href = isGoogle
    ? `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  return true;
}
