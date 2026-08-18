import React, { useEffect, useMemo, useState } from 'react';
import LandingPageV5 from './LandingPageV5';
import './LandingPageV6.css';
import './LandingPageV6Polish.css';
import './LandingPageV6Focused.css';

const heroMeetings = [
  {
    person: 'Maya Chen',
    initials: 'MC',
    type: 'Investor intro',
    status: 'Follow-up due',
    meta: 'Waiting 3 days',
    lane: 'followup',
  },
  {
    person: 'Priya Shah',
    initials: 'PS',
    type: 'Candidate screen',
    status: 'Link sent',
    meta: 'Sent today',
    lane: 'waiting',
  },
  {
    person: 'Daniel Ortiz',
    initials: 'DO',
    type: 'Customer discovery',
    status: 'Booked',
    meta: 'Tue · 14:30',
    lane: 'booked',
  },
];

const liveStates = [
  {
    eyebrow: 'Follow-up due',
    title: 'Maya has been waiting for 3 days',
    detail: 'Keep the warm intro from going cold.',
    action: 'Send a nudge',
    tone: 'amber',
  },
  {
    eyebrow: 'Request active',
    title: 'Priya has the booking link',
    detail: 'No action needed yet. The request stays visible.',
    action: 'View request',
    tone: 'blue',
  },
  {
    eyebrow: 'Meeting booked',
    title: 'Daniel picked Tuesday at 14:30',
    detail: 'The meeting context is ready for preparation.',
    action: 'Open meeting',
    tone: 'green',
  },
];

const walkthroughSteps = [
  {
    label: 'Create',
    title: 'Set up the meeting request',
    copy: 'Choose the guest, meeting intent, duration and working window before generating availability.',
  },
  {
    label: 'Offer',
    title: 'Offer only the times you want',
    copy: 'Connected calendars are checked against your rules so the guest sees a focused set of available slots.',
  },
  {
    label: 'Track',
    title: 'Keep the request visible',
    copy: 'See which links are fresh, which meetings are booked and which requests need a follow-up.',
  },
  {
    label: 'Confirm',
    title: 'Move into the meeting with context',
    copy: 'Once a guest books, the time, meeting type and request details stay together instead of disappearing into an inbox thread.',
  },
];

function CallSyncMark() {
  return (
    <span className="v6-brand" aria-label="CallSync">
      <span className="v6-brand-mark" aria-hidden="true"><i /><i /></span>
      <strong>CallSync</strong>
    </span>
  );
}

function MeetingCard({ index, active, onSelect }) {
  const meeting = heroMeetings[index];
  return (
    <button
      type="button"
      className={`v6-meeting-card ${meeting.lane} ${active ? 'active' : ''}`}
      onClick={() => onSelect(index)}
      aria-pressed={active}
    >
      <span className="v6-card-topline">
        <span className="v6-person-avatar">{meeting.initials}</span>
        <span className="v6-card-menu">•••</span>
      </span>
      <strong>{meeting.person}</strong>
      <small>{meeting.type}</small>
      <span className={`v6-status ${meeting.lane}`}><i />{meeting.status}</span>
      <span className="v6-card-meta">{meeting.meta}</span>
    </button>
  );
}

function HeroWorkspace({ active, setActive }) {
  const live = liveStates[active];

  return (
    <div className="v6-product-stage" data-v6-reveal>
      <div className="v6-stage-glow" aria-hidden="true" />
      <div className="v6-app-frame">
        <div className="v6-app-topbar">
          <CallSyncMark />
          <div className="v6-breadcrumb"><span>Workspace</span><b>/</b><strong>Meeting pipeline</strong></div>
          <div className="v6-topbar-actions"><span className="v6-sync-dot"><i /> Calendar synced</span><span className="v6-user-avatar">AK</span></div>
        </div>

        <div className="v6-app-body">
          <aside className="v6-sidebar">
            <span className="active"><b>⌁</b>Pipeline</span>
            <span><b>↗</b>Requests</span>
            <span><b>□</b>Calendar</span>
            <span><b>◇</b>Templates</span>
            <div className="v6-sidebar-spacer" />
            <small>Connected calendars</small>
            <span className="compact"><i className="google-dot" />Google</span>
            <span className="compact"><i className="outlook-dot" />Outlook</span>
          </aside>

          <section className="v6-workspace-main">
            <div className="v6-workspace-head">
              <div>
                <span className="v6-kicker">Meeting workspace</span>
                <h2>Meeting pipeline</h2>
                <p>Keep every request visible from invite to booked.</p>
              </div>
              <button type="button" className="v6-new-request">+ New request</button>
            </div>

            <div className="v6-summary-row">
              <span><small>Active requests</small><strong>3</strong></span>
              <span><small>Needs attention</small><strong>1</strong></span>
              <span><small>Booked this week</small><strong>1</strong></span>
              <span className="v6-summary-note"><i /> Live status</span>
            </div>

            <div className="v6-board">
              <section className="v6-lane">
                <header><span><i className="amber" />Needs follow-up</span><b>1</b></header>
                <MeetingCard index={0} active={active === 0} onSelect={setActive} />
                <div className="v6-lane-empty">Requests waiting too long appear here.</div>
              </section>
              <section className="v6-lane">
                <header><span><i className="blue" />Link sent</span><b>1</b></header>
                <MeetingCard index={1} active={active === 1} onSelect={setActive} />
                <div className="v6-lane-empty">Fresh booking links stay visible.</div>
              </section>
              <section className="v6-lane">
                <header><span><i className="green" />Booked</span><b>1</b></header>
                <MeetingCard index={2} active={active === 2} onSelect={setActive} />
                <div className="v6-lane-empty">Confirmed meetings move here.</div>
              </section>
            </div>
          </section>
        </div>
      </div>

      <div className={`v6-live-toast ${live.tone}`} key={live.eyebrow}>
        <span className="v6-toast-icon"><i /></span>
        <span className="v6-toast-copy"><small>{live.eyebrow}</small><strong>{live.title}</strong><em>{live.detail}</em></span>
        <button type="button" onClick={() => setActive((active + 1) % liveStates.length)}>{live.action} <b>→</b></button>
      </div>

      <div className="v6-booking-preview" aria-label="Public booking page preview">
        <div className="v6-booking-head"><span className="v6-mini-brand">CS</span><span><strong>Customer discovery</strong><small>30 min · Video call</small></span></div>
        <p>Choose a time</p>
        <div className="v6-time-row"><span>13:30</span><span className="selected">14:30</span><span>16:00</span></div>
        <small className="v6-booking-foot">Guest booking · no account required</small>
      </div>
    </div>
  );
}

function ProviderMark({ type }) {
  if (type === 'google') {
    return <span className="v6-provider-logo google" aria-hidden="true"><i /><b>31</b></span>;
  }
  return <span className="v6-provider-logo outlook" aria-hidden="true"><b>O</b><i>✉</i></span>;
}

function IntegrationRail() {
  return (
    <section className="v6-focused-integrations" aria-label="Calendar integrations">
      <span className="v6-integration-label">Works with</span>
      <span className="v6-provider"><ProviderMark type="google" /><strong>Google Calendar</strong></span>
      <span className="v6-provider"><ProviderMark type="outlook" /><strong>Microsoft Outlook</strong></span>
      <p>Connect your calendar. Keep control of the times you offer.</p>
    </section>
  );
}

function WalkthroughScene({ active }) {
  if (active === 0) {
    return (
      <div className="v6-walk-scene create" key="create">
        <div className="v6-scene-title"><span><small>New request</small><strong>Investor intro with Maya</strong></span><em>Draft</em></div>
        <div className="v6-form-grid">
          <label><span>Guest</span><strong>Maya Chen</strong><small>maya@northstar.vc</small></label>
          <label><span>Template</span><strong>Investor intro</strong><small>Focused fundraising conversation</small></label>
          <label><span>Duration</span><strong>30 minutes</strong><small>15 minute buffer</small></label>
          <label><span>Working window</span><strong>13:00–17:00</strong><small>Tuesday to Thursday</small></label>
        </div>
        <div className="v6-scene-footer"><span><i /> Google + Outlook connected</span><button type="button">Generate availability →</button></div>
      </div>
    );
  }

  if (active === 1) {
    return (
      <div className="v6-walk-scene offer" key="offer">
        <div className="v6-scene-title"><span><small>Availability</small><strong>Choose the slots you want to offer</strong></span><em>6 available</em></div>
        <div className="v6-calendar-shell">
          <div className="v6-calendar-days"><span>Tue <b>18</b></span><span className="active">Wed <b>19</b></span><span>Thu <b>20</b></span></div>
          <div className="v6-calendar-times">
            {['13:00','13:30','14:30','15:00','16:00','16:30'].map((time, index) => <button type="button" className={index === 2 || index === 4 ? 'selected' : ''} key={time}>{time}</button>)}
          </div>
          <div className="v6-availability-note"><span><i /> Busy time removed automatically</span><strong>2 slots selected</strong></div>
        </div>
        <div className="v6-scene-footer"><span>Guest sees only approved times</span><button type="button">Create booking link →</button></div>
      </div>
    );
  }

  if (active === 2) {
    return (
      <div className="v6-walk-scene track" key="track">
        <div className="v6-scene-title"><span><small>Pipeline</small><strong>Every request has a visible state</strong></span><em><i /> Live</em></div>
        <div className="v6-track-list">
          <span><b className="avatar amber">MC</b><span><strong>Maya Chen</strong><small>Investor intro</small></span><em className="amber">Follow-up due</em><small>Waiting 3 days</small></span>
          <span><b className="avatar blue">PS</b><span><strong>Priya Shah</strong><small>Candidate screen</small></span><em className="blue">Link sent</em><small>Sent today</small></span>
          <span><b className="avatar green">DO</b><span><strong>Daniel Ortiz</strong><small>Customer discovery</small></span><em className="green">Booked</em><small>Tue · 14:30</small></span>
        </div>
        <div className="v6-scene-footer"><span><i className="attention" /> 1 request needs attention</span><button type="button">Open pipeline →</button></div>
      </div>
    );
  }

  return (
    <div className="v6-walk-scene confirm" key="confirm">
      <div className="v6-confirm-status"><span className="check">✓</span><span><small>Meeting confirmed</small><strong>Customer discovery with Daniel Ortiz</strong></span></div>
      <div className="v6-confirm-grid">
        <span><small>When</small><strong>Tuesday · 14:30</strong><em>30 minutes</em></span>
        <span><small>Meeting type</small><strong>Customer discovery</strong><em>Video call</em></span>
        <span><small>Booking state</small><strong>Confirmed</strong><em>Calendar event created</em></span>
        <span><small>Purpose</small><strong>Understand the current workflow</strong><em>Request details stay attached</em></span>
      </div>
      <div className="v6-scene-footer"><span><i /> Ready for the meeting</span><button type="button">Open meeting →</button></div>
    </div>
  );
}

function ProductWalkthrough({ active, setActive }) {
  const step = walkthroughSteps[active];
  return (
    <section className="v6-focused-product" id="product">
      <div className="v6-focused-product-head" data-v6-reveal>
        <span className="v6-section-label">Product walkthrough</span>
        <h2>See the meeting move through CallSync.</h2>
        <p>Not four abstract feature cards. One request, moving through the actual workflow from setup to confirmation.</p>
      </div>

      <div className="v6-walkthrough" data-v6-reveal>
        <div className="v6-walk-nav" role="tablist" aria-label="Product walkthrough steps">
          {walkthroughSteps.map((item, index) => (
            <button type="button" role="tab" aria-selected={active === index} className={active === index ? 'active' : ''} onClick={() => setActive(index)} key={item.label}>
              <span>0{index + 1}</span><strong>{item.label}</strong><small>{item.title}</small>
              <i><b /></i>
            </button>
          ))}
        </div>

        <div className="v6-walk-app">
          <div className="v6-walk-topbar"><CallSyncMark /><span>Workspace / <strong>{step.label}</strong></span><em><i /> Calendar connected</em></div>
          <div className="v6-walk-body">
            <aside><span className={active === 0 ? 'active' : ''}>New request</span><span className={active === 1 ? 'active' : ''}>Availability</span><span className={active === 2 ? 'active' : ''}>Pipeline</span><span className={active === 3 ? 'active' : ''}>Booked</span></aside>
            <main><WalkthroughScene active={active} /></main>
          </div>
        </div>

        <div className="v6-walk-caption" key={step.label}><span>0{active + 1}</span><div><strong>{step.title}</strong><p>{step.copy}</p></div></div>
      </div>
    </section>
  );
}

function LandingPageV6() {
  const [active, setActive] = useState(0);
  const [walkthrough, setWalkthrough] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const hasToken = useMemo(() => Boolean(localStorage.getItem('token')), []);
  const appHref = hasToken ? '/dashboard' : '/login';
  const live = liveStates[active];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 34);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % heroMeetings.length), 3400);
    const walkthroughTimer = window.setInterval(() => setWalkthrough((value) => (value + 1) % walkthroughSteps.length), 5200);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(walkthroughTimer);
    };
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll('[data-v6-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="v6-page">
      <div className="v6-announcement">
        <span><i /> CallSync early access is open</span>
        <a href={appHref}>Free during beta <b>→</b></a>
      </div>

      <header className={`v6-nav-shell ${scrolled ? 'scrolled' : ''}`}>
        <nav className="v6-nav">
          <a href="/" className="v6-nav-brand"><CallSyncMark /></a>
          <div className="v6-nav-links">
            <a href="#product">Product</a>
            <a href="#use-cases">Use cases</a>
            <a href="#compare">Compare</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="v6-nav-actions">
            <a className="v6-signin" href="/login">Sign in</a>
            <a className="v6-nav-cta" href={appHref}>{hasToken ? 'Open dashboard' : 'Start free'} <span>→</span></a>
          </div>
        </nav>
      </header>

      <section className="v6-hero">
        <div className="v6-hero-copy" data-v6-reveal>
          <span className="v6-eyebrow"><i /> Meeting CRM for high-value calls</span>
          <h1>Turn interested replies into <em>booked, prepared meetings.</em></h1>
          <p>Curate the times you want to offer, share one focused booking link, and keep every request visible until the conversation happens.</p>
          <div className={`v6-hero-live ${live.tone}`} key={`hero-${live.eyebrow}`}>
            <span><i /> Live in CallSync</span><strong>{live.title}</strong><small>{live.eyebrow}</small>
          </div>
          <div className="v6-hero-actions">
            <a className="v6-primary-cta" href={appHref}>{hasToken ? 'Open your pipeline' : 'Sign up free'} <span>→</span></a>
            <a className="v6-secondary-cta" href="#product"><span className="v6-play">▶</span> See how it works</a>
          </div>
          <div className="v6-hero-proof"><span>Free during beta</span><i /> <span>No credit card required</span><i /> <span>Guests book without an account</span></div>
        </div>

        <HeroWorkspace active={active} setActive={setActive} />
      </section>

      <IntegrationRail />
      <ProductWalkthrough active={walkthrough} setActive={setWalkthrough} />
      <LandingPageV5 />
    </div>
  );
}

export default LandingPageV6;
