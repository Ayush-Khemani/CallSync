import React, { useEffect, useMemo, useState } from 'react';
import LandingPageV5 from './LandingPageV5';
import './LandingPageV6.css';

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

function LandingPageV6() {
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const hasToken = useMemo(() => Boolean(localStorage.getItem('token')), []);
  const appHref = hasToken ? '/dashboard' : '/login';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 34);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % heroMeetings.length), 3400);
    return () => window.clearInterval(timer);
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
          <div className="v6-hero-actions">
            <a className="v6-primary-cta" href={appHref}>{hasToken ? 'Open your pipeline' : 'Start free'} <span>→</span></a>
            <a className="v6-secondary-cta" href="#product"><span className="v6-play">▶</span> Explore the product</a>
          </div>
          <div className="v6-hero-proof"><span>Free during beta</span><i /> <span>No guest account required</span></div>
        </div>

        <HeroWorkspace active={active} setActive={setActive} />
      </section>

      <LandingPageV5 />
    </div>
  );
}

export default LandingPageV6;
