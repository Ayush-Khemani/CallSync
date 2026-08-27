import React from 'react';
import CalendarConnectionStatus from './CalendarConnectionStatus';
import { beginOAuth } from './workspaceShared';

export default function CalendarsView() {
  return (
    <section className="pw-page pw-calendars-page">
      <header className="pw-page-head compact">
        <div><p className="pw-kicker">Calendar connections</p><h1>Your availability sources.</h1><p>CallSync uses calendar busy/free data to protect availability and narrow send permissions to deliver meeting communication.</p></div>
      </header>

      <div className="integrations pw-calendar-grid">
        <article className="google pw-calendar-card">
          <div className="pw-calendar-icon">G</div>
          <span>Google Calendar + Gmail</span>
          <h2>Google workspace</h2>
          <p>Use Google Calendar for availability and Gmail to send approved meeting communication from your own account.</p>
          <button className="pw-primary-button" type="button" onClick={() => beginOAuth('google')}>Connect / reconnect Google</button>
        </article>
        <article className="outlook pw-calendar-card">
          <div className="pw-calendar-icon">O</div>
          <span>Outlook Calendar + Mail</span>
          <h2>Microsoft workspace</h2>
          <p>Use Outlook Calendar for availability and delegated Mail.Send for approved communication from your Microsoft account.</p>
          <button className="pw-primary-button" type="button" onClick={() => beginOAuth('outlook')}>Connect / reconnect Outlook</button>
        </article>
      </div>
      <CalendarConnectionStatus />
    </section>
  );
}
