import React from 'react';
import CalendarConnectionStatus from './CalendarConnectionStatus';
import { beginOAuth } from './workspaceShared';

export default function CalendarsView() {
  return (
    <section className="pw-page pw-calendars-page">
      <header className="pw-page-head compact">
        <div><h1>Calendars</h1></div>
      </header>

      <div className="integrations pw-calendar-grid">
        <article className="google pw-calendar-card">
          <div className="pw-calendar-icon">G</div>
          <h2>Google</h2>
          <p>Calendar availability and Gmail sending.</p>
          <button className="pw-primary-button" type="button" onClick={() => beginOAuth('google')}>Connect Google</button>
        </article>
        <article className="outlook pw-calendar-card">
          <div className="pw-calendar-icon">O</div>
          <h2>Microsoft</h2>
          <p>Outlook availability and email sending.</p>
          <button className="pw-primary-button" type="button" onClick={() => beginOAuth('outlook')}>Connect Microsoft</button>
        </article>
      </div>
      <CalendarConnectionStatus />
    </section>
  );
}
