import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function OAuthCallbackPage({ provider }) {
  const [state, setState] = useState({ status: 'connecting', message: '' });
  const providerLabel = provider === 'google' ? 'Google Calendar' : 'Outlook Calendar';

  useEffect(() => {
    let active = true;

    async function connect() {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error');
      const code = params.get('code');

      if (oauthError) {
        if (active) setState({ status: 'error', message: `${providerLabel} authorization was not completed.` });
        return;
      }

      if (!code) {
        if (active) setState({ status: 'error', message: `No authorization code was returned by ${providerLabel}.` });
        return;
      }

      try {
        await axios.post(`${API_URL}/api/auth/${provider}-callback`, { code }, { headers: authHeaders() });
        if (!active) return;
        setState({ status: 'connected', message: `${providerLabel} connected successfully.` });
        window.setTimeout(() => window.location.replace('/dashboard'), 700);
      } catch (error) {
        if (!active) return;
        setState({
          status: 'error',
          message: error.response?.data?.error || `Could not connect ${providerLabel}. Please try again.`,
        });
      }
    }

    connect();
    return () => { active = false; };
  }, [provider, providerLabel]);

  return (
    <main className="callback">
      <section className="panel booking">
        <p className="eyebrow">Calendar connection</p>
        <h1>{state.status === 'connecting' ? `Connecting ${providerLabel}…` : state.message}</h1>
        {state.status === 'connecting' && <p>CallSync is finishing the secure calendar connection.</p>}
        {state.status === 'connected' && <p>Returning to your meeting workspace.</p>}
        {state.status === 'error' && (
          <>
            <p>Your existing CallSync data is unchanged. You can retry the connection from the Calendars tab.</p>
            <a className="btn primary" href="/dashboard">Back to dashboard</a>
          </>
        )}
      </section>
    </main>
  );
}
