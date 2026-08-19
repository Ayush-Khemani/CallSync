const axios = require('axios');
const config = require('../config/env');
const { decryptToken, encryptToken } = require('../utils/tokenCrypto');

axios.defaults.timeout = 7000;

const REFRESH_SKEW_MS = 60 * 1000;

function buildTokenBundle(data, existingRefreshToken = '') {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || existingRefreshToken || '',
    expiresAt: data.expires_in ? Date.now() + (Number(data.expires_in) * 1000) : null,
  };
}

function parseCalendarToken(encryptedToken) {
  const decrypted = decryptToken(encryptedToken);
  if (!decrypted) {
    return null;
  }

  try {
    const parsed = JSON.parse(decrypted);
    if (parsed && parsed.accessToken) {
      return parsed;
    }
  } catch (error) {
    return { accessToken: decrypted, refreshToken: '', expiresAt: null };
  }

  return { accessToken: decrypted, refreshToken: '', expiresAt: null };
}

function serializeCalendarToken(bundle) {
  if (!bundle) {
    return null;
  }

  return encryptToken(JSON.stringify(bundle));
}

function requireRedirectUri(provider, redirectUri) {
  if (!redirectUri) {
    throw new Error(`${provider} OAuth redirect URI is required`);
  }
  return redirectUri;
}

function normalizeDurationMinutes(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return 60;
  }
  return duration;
}

function eventEnd(slotTime, durationMinutes) {
  return new Date(new Date(slotTime).getTime() + normalizeDurationMinutes(durationMinutes) * 60000).toISOString();
}

function googleEventBody(slotTime, attendeeEmail, options = {}, includeAttendees = false) {
  const durationMinutes = normalizeDurationMinutes(options.durationMinutes);
  const summary = options.summary || (attendeeEmail ? `Meeting with ${attendeeEmail}` : 'CallSync meeting hold');
  return {
    summary,
    start: { dateTime: slotTime },
    end: { dateTime: eventEnd(slotTime, durationMinutes) },
    ...(attendeeEmail
      ? { attendees: [{ email: attendeeEmail }] }
      : includeAttendees ? { attendees: [] } : {}),
  };
}

function outlookEventBody(slotTime, attendeeEmail, options = {}, includeAttendees = false) {
  const durationMinutes = normalizeDurationMinutes(options.durationMinutes);
  const subject = options.summary || (attendeeEmail ? `Meeting with ${attendeeEmail}` : 'CallSync meeting hold');
  return {
    subject,
    start: { dateTime: new Date(slotTime).toISOString(), timeZone: 'UTC' },
    end: { dateTime: eventEnd(slotTime, durationMinutes), timeZone: 'UTC' },
    ...(attendeeEmail
      ? { attendees: [{ emailAddress: { address: attendeeEmail }, type: 'required' }] }
      : includeAttendees ? { attendees: [] } : {}),
  };
}

async function exchangeGoogleCode(code, redirectUri = config.google.redirectUri) {
  const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    code,
    redirect_uri: requireRedirectUri('Google', redirectUri),
    grant_type: 'authorization_code',
  }));

  return buildTokenBundle(response.data);
}

async function exchangeOutlookCode(code, redirectUri = config.outlook.redirectUri) {
  const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
    client_id: config.outlook.clientId,
    client_secret: config.outlook.clientSecret,
    code,
    redirect_uri: requireRedirectUri('Outlook', redirectUri),
    grant_type: 'authorization_code',
    scope: 'Calendars.ReadWrite offline_access',
  }));

  return buildTokenBundle(response.data);
}

async function refreshGoogleToken(bundle) {
  const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    refresh_token: bundle.refreshToken,
    grant_type: 'refresh_token',
  }));

  return buildTokenBundle(response.data, bundle.refreshToken);
}

async function refreshOutlookToken(bundle) {
  const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
    client_id: config.outlook.clientId,
    client_secret: config.outlook.clientSecret,
    refresh_token: bundle.refreshToken,
    grant_type: 'refresh_token',
    scope: 'Calendars.ReadWrite offline_access',
  }));

  return buildTokenBundle(response.data, bundle.refreshToken);
}

async function getAccessToken(encryptedToken, refreshTokenFn, onTokenRefresh) {
  let bundle = parseCalendarToken(encryptedToken);
  if (!bundle?.accessToken) {
    return null;
  }

  const shouldRefresh = bundle.refreshToken && bundle.expiresAt && Date.now() > (bundle.expiresAt - REFRESH_SKEW_MS);
  if (shouldRefresh) {
    bundle = await refreshTokenFn(bundle);
    await onTokenRefresh?.(bundle);
  }

  return { token: bundle.accessToken, bundle };
}

async function requestWithRefresh(encryptedToken, refreshTokenFn, onTokenRefresh, requestFn) {
  const tokenState = await getAccessToken(encryptedToken, refreshTokenFn, onTokenRefresh);
  if (!tokenState) {
    return null;
  }

  try {
    return await requestFn(tokenState.token);
  } catch (error) {
    const canRefresh = error.response?.status === 401 && tokenState.bundle.refreshToken;
    if (!canRefresh) {
      throw error;
    }

    const refreshedBundle = await refreshTokenFn(tokenState.bundle);
    await onTokenRefresh?.(refreshedBundle);
    return requestFn(refreshedBundle.accessToken);
  }
}

async function fetchGoogleEvents(encryptedToken, windowStart, windowEnd, options = {}) {
  const response = await requestWithRefresh(encryptedToken, refreshGoogleToken, options.onTokenRefresh, (token) => (
    axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        timeMin: new Date(windowStart).toISOString(),
        timeMax: new Date(windowEnd).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      },
    })
  ));

  if (!response) {
    return [];
  }

  return response.data.items || [];
}

async function fetchOutlookEvents(encryptedToken, windowStart, windowEnd, options = {}) {
  const response = await requestWithRefresh(encryptedToken, refreshOutlookToken, options.onTokenRefresh, (token) => (
    axios.get('https://graph.microsoft.com/v1.0/me/calendarView', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        startDateTime: new Date(windowStart).toISOString(),
        endDateTime: new Date(windowEnd).toISOString(),
        $orderby: 'start/dateTime',
      },
    })
  ));

  if (!response) {
    return [];
  }

  return response.data.value || [];
}

async function createGoogleEvent(encryptedToken, slotTime, attendeeEmail, options = {}) {
  const response = await requestWithRefresh(encryptedToken, refreshGoogleToken, options.onTokenRefresh, (token) => (
    axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      googleEventBody(slotTime, attendeeEmail, options),
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { sendUpdates: attendeeEmail ? 'all' : 'none' },
      }
    )
  ));

  return response?.data?.id || null;
}

async function createOutlookEvent(encryptedToken, slotTime, attendeeEmail, options = {}) {
  const response = await requestWithRefresh(encryptedToken, refreshOutlookToken, options.onTokenRefresh, (token) => (
    axios.post(
      'https://graph.microsoft.com/v1.0/me/calendar/events',
      outlookEventBody(slotTime, attendeeEmail, options),
      { headers: { Authorization: `Bearer ${token}` } }
    )
  ));

  return response?.data?.id || null;
}

async function updateGoogleEvent(encryptedToken, eventId, slotTime, attendeeEmail, options = {}) {
  if (!eventId) {
    return null;
  }

  const response = await requestWithRefresh(encryptedToken, refreshGoogleToken, options.onTokenRefresh, (token) => (
    axios.patch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      googleEventBody(slotTime, attendeeEmail, options, true),
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { sendUpdates: attendeeEmail || options.notifyAttendees ? 'all' : 'none' },
      }
    )
  ));

  return response?.data?.id || eventId;
}

async function updateOutlookEvent(encryptedToken, eventId, slotTime, attendeeEmail, options = {}) {
  if (!eventId) {
    return null;
  }

  const response = await requestWithRefresh(encryptedToken, refreshOutlookToken, options.onTokenRefresh, (token) => (
    axios.patch(
      `https://graph.microsoft.com/v1.0/me/calendar/events/${eventId}`,
      outlookEventBody(slotTime, attendeeEmail, options, true),
      { headers: { Authorization: `Bearer ${token}` } }
    )
  ));

  return response?.data?.id || eventId;
}

async function deleteGoogleEvent(encryptedToken, eventId, options = {}) {
  if (!eventId) {
    return;
  }

  await requestWithRefresh(encryptedToken, refreshGoogleToken, options.onTokenRefresh, (token) => (
    axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { sendUpdates: options.notifyAttendees ? 'all' : 'none' },
      }
    )
  ));
}

async function deleteOutlookEvent(encryptedToken, eventId, options = {}) {
  if (!eventId) {
    return;
  }

  await requestWithRefresh(encryptedToken, refreshOutlookToken, options.onTokenRefresh, (token) => (
    axios.delete(
      `https://graph.microsoft.com/v1.0/me/calendar/events/${eventId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
  ));
}

module.exports = {
  exchangeGoogleCode,
  exchangeOutlookCode,
  serializeCalendarToken,
  fetchGoogleEvents,
  fetchOutlookEvents,
  createGoogleEvent,
  createOutlookEvent,
  updateGoogleEvent,
  updateOutlookEvent,
  deleteGoogleEvent,
  deleteOutlookEvent,
};
