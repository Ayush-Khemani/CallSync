import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Stage6CHealth.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Metric({ label, value, detail }) {
  return (
    <article className="stage6c-health-metric">
      <span>{label}</span>
      <strong>{value}%</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function Stage6CHealth() {
  const [metrics, setMetrics] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/api/analytics/meeting-lifecycle`, { headers: authHeaders() })
      .then((response) => {
        if (active) setMetrics(response.data?.allTime || null);
      })
      .catch(() => {
        if (active) setMetrics(null);
      });
    return () => { active = false; };
  }, []);

  if (!metrics || metrics.totalCreated === 0) return null;

  return (
    <aside className={`stage6c-health ${open ? 'open' : ''}`}>
      <button className="stage6c-health-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>Meeting health</span>
        <b>{metrics.rates.booking}% booked</b>
      </button>
      {open && (
        <div className="stage6c-health-panel">
          <header>
            <div><small>Lifecycle analytics</small><strong>{metrics.totalCreated} meeting request{metrics.totalCreated === 1 ? '' : 's'}</strong></div>
            {metrics.followUpDue > 0 && <em>{metrics.followUpDue} follow-up due</em>}
          </header>
          <div className="stage6c-health-grid">
            <Metric label="Booking" value={metrics.rates.booking} detail={`${metrics.booked} booked`} />
            <Metric label="Follow-up touched" value={metrics.rates.followUpTouched} detail={`${metrics.followedUp} requests`} />
            <Metric label="Outcome capture" value={metrics.rates.outcomeCapture} detail={`${metrics.outcomesRecorded} recorded`} />
          </div>
          <p>Rates come from your CallSync meeting lifecycle only. Calendar event contents are not used for analytics.</p>
        </div>
      )}
    </aside>
  );
}
