import React from 'react';
import './LandingPageV2.css';

const pipelineMeetings = [
  {
    person: 'Maya Chen',
    type: 'Investor intro',
    state: 'Follow-up due',
    meta: 'Sent 3 days ago',
    tone: 'attention',
  },
  {
    person: 'Daniel Ortiz',
    type: 'Customer discovery',
    state: 'Booked',
    meta: 'Tue · 14:30',
    tone: 'success',
  },
  {
    person: 'Priya Shah',
    type: 'Candidate screen',
    state: 'Waiting',
    meta: 'Sent today',
    tone: 'neutral',
  },
];

const lifecycle = [
  {
    number: '01',
    title: 'Turn the reply into a focused invite',
    copy: 'Set the meeting intent, guest, duration, buffers, and the working window before a link ever leaves your hands.',
  },
  {
    number: '02',
    title: 'Offer times you actually want booked',
    copy: 'CallSync checks connected calendars and turns your constraints into a curated set of available slots.',
  },
  {
    number: '03',
    title: 'See what happened after send',
    copy: 'Pending links, confirmed meetings, closed requests, and follow-up risk stay visible in one meeting pipeline.',
  },
  {
    number: '04',
    title: 'Walk into the call with context',
    copy: 'Keep the meeting intent and preparation brief attached to the workflow instead of reconstructing context five minutes before the call.',
  },
];

const callTypes = [
  ['Founder sales', 'Qualify customer pain, urgency, and the next commercial step.'],
  ['Investor intro', 'Keep fundraising conversations focused on stage fit and the highest-value topic.'],
  ['Recruiting screen', 'Structure role fit, timing, and the discussion points that matter before the interview.'],
  ['Client onboarding', 'Align outcome, stakeholders, constraints, and next steps before kickoff.'],
];

function Logo() {
  return (
    <span className="homev2-logo" aria-label="CallSync">
      <span className="homev2-logo-mark">CS</span>
      <strong>CallSync</strong>
    </span>
  );
}

function PipelinePreview() {
  return (
    <div className="homev2-product" aria-label="CallSync meeting pipeline preview">
      <div className="homev2-product-bar">
        <div>
          <span className="homev2-window-dot" />
          <span className="homev2-window-dot" />
          <span className="homev2-window-dot" />
        </div>
        <span>Meeting pipeline</span>
        <span>3 active</span>
      </div>

      <div className="homev2-product-body">
        <div className="homev2-pipeline-list">
          <div className="homev2-list-heading">
            <span>Conversation</span>
            <span>Status</span>
          </div>
          {pipelineMeetings.map((meeting, index) => (
            <div className={`homev2-pipeline-row ${index === 0 ? 'is-selected' : ''}`} key={meeting.person}>
              <div className="homev2-person">
                <span className="homev2-avatar">{meeting.person.split(' ').map((part) => part[0]).join('')}</span>
                <span>
                  <strong>{meeting.person}</strong>
                  <small>{meeting.type}</small>
                </span>
              </div>
              <div className="homev2-row-status">
                <span className={`homev2-status-dot ${meeting.tone}`} />
                <span>
                  <strong>{meeting.state}</strong>
                  <small>{meeting.meta}</small>
                </span>
              </div>
            </div>
          ))}
        </div>

        <aside className="homev2-next-action">
          <span className="homev2-mini-label">Next action</span>
          <div className="homev2-action-person">
            <span className="homev2-avatar large">MC</span>
            <div>
              <strong>Maya Chen</strong>
              <small>Investor intro · 30 min</small>
            </div>
          </div>
          <p>The invite has been waiting for 3 days. Send a personal nudge before the conversation goes cold.</p>
          <button type="button">Open request</button>

          <div className="homev2-timeline" aria-label="Meeting lifecycle">
            <div className="done"><span />Reply received<small>Mon 09:12</small></div>
            <div className="done"><span />Invite sent<small>Mon 09:18</small></div>
            <div className="current"><span />Follow-up due<small>Today</small></div>
            <div><span />Booked<small>Waiting</small></div>
          </div>
        </aside>
      </div>

      <div className="homev2-product-footer">
        <span><b>Google Calendar</b> connected</span>
        <span><b>Outlook</b> connected</span>
        <span><b>6</b> curated slots ready</span>
      </div>
    </div>
  );
}

function LandingPageV2() {
  const hasToken = Boolean(localStorage.getItem('token'));

  return (
    <main className="homev2">
      <header className="homev2-nav-shell">
        <nav className="homev2-nav" aria-label="Primary navigation">
          <a className="homev2-brand-link" href="/" aria-label="CallSync home"><Logo /></a>
          <div className="homev2-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#use-cases">Use cases</a>
            <a href="/login">Sign in</a>
            <a className="homev2-nav-cta" href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open dashboard' : 'Try CallSync'}</a>
          </div>
        </nav>
      </header>

      <section className="homev2-hero">
        <div className="homev2-hero-copy">
          <p className="homev2-kicker">Meeting CRM for high-value calls</p>
          <h1>Turn “sounds good” into a meeting that actually happens.</h1>
          <p className="homev2-lede">
            CallSync takes over where the interested reply ends: create a focused invite, offer curated availability, track booking status, and know when a conversation needs a follow-up.
          </p>
          <div className="homev2-actions">
            <a className="homev2-primary" href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open your pipeline' : 'Create a meeting request'}</a>
            <a className="homev2-secondary" href="#how-it-works">See the workflow <span aria-hidden="true">↓</span></a>
          </div>
          <div className="homev2-capabilities" aria-label="Current CallSync capabilities">
            <span>Google Calendar</span>
            <span>Outlook</span>
            <span>Curated availability</span>
            <span>Follow-up risk</span>
          </div>
        </div>

        <PipelinePreview />
      </section>

      <section className="homev2-reply-section">
        <div className="homev2-reply-inner">
          <blockquote>“Yes, happy to chat next week.”</blockquote>
          <div>
            <p className="homev2-kicker">The scheduling link is not the workflow</p>
            <h2>The real work starts after the reply.</h2>
            <p>
              A normal booking link solves one moment: choosing a time. High-value meetings have a longer lifecycle—deciding what the call is for, offering the right windows, keeping the invite from going cold, and carrying context into the conversation.
            </p>
          </div>
        </div>
      </section>

      <section className="homev2-lifecycle" id="how-it-works">
        <div className="homev2-section-head">
          <p className="homev2-kicker">One visible lifecycle</p>
          <h2>From interested reply to prepared call.</h2>
          <p>CallSync is designed around the host’s workflow, not around producing another generic calendar page.</p>
        </div>
        <div className="homev2-lifecycle-list">
          {lifecycle.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="homev2-workspace-story">
        <div className="homev2-story-copy">
          <p className="homev2-kicker">Built around next actions</p>
          <h2>Your dashboard should tell you what needs attention.</h2>
          <p>
            CallSync treats every meeting request like a small pipeline. Fresh invites can wait. Older unanswered links surface as follow-up risk. Confirmed calls move forward. Closed requests get out of the way.
          </p>
          <a href={hasToken ? '/dashboard' : '/login'}>Open the meeting pipeline <span aria-hidden="true">→</span></a>
        </div>

        <div className="homev2-event-log" aria-label="Example CallSync activity log">
          <div className="homev2-event-log-header">
            <span>Investor intro · Maya Chen</span>
            <span>Live workflow</span>
          </div>
          <ol>
            <li className="complete"><span>09:12</span><div><strong>Interested reply received</strong><small>“Happy to chat next week.”</small></div></li>
            <li className="complete"><span>09:18</span><div><strong>Focused request created</strong><small>30 minutes · 15 minute buffer · afternoons only</small></div></li>
            <li className="complete"><span>09:20</span><div><strong>Six approved slots shared</strong><small>Availability checked across connected calendars</small></div></li>
            <li className="attention"><span>Today</span><div><strong>Follow-up is now due</strong><small>The invite has been waiting for three days</small></div></li>
          </ol>
          <div className="homev2-event-next"><span>Next best action</span><strong>Send a personal nudge</strong><button type="button">Review request</button></div>
        </div>
      </section>

      <section className="homev2-use-cases" id="use-cases">
        <div className="homev2-section-head compact">
          <p className="homev2-kicker">Not every meeting is the same</p>
          <h2>Start with the intent of the call.</h2>
        </div>
        <div className="homev2-call-type-list">
          {callTypes.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="homev2-final-cta">
        <div>
          <p className="homev2-kicker">CallSync</p>
          <h2>Stop treating the meeting link as the finish line.</h2>
        </div>
        <div>
          <p>Turn interested replies into booked, visible, and better-prepared meetings.</p>
          <a href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Go to your dashboard' : 'Create your first request'} <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <footer className="homev2-footer">
        <Logo />
        <p>Meeting CRM for high-value calls.</p>
        <a href="/login">Sign in</a>
      </footer>
    </main>
  );
}

export default LandingPageV2;
