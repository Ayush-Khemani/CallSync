import React, { useEffect, useMemo, useState } from 'react';
import './LandingPageV4.css';
import './LandingPageV5.css';

const HUMAN_CALL_PHOTO = 'https://images.unsplash.com/photo-1758873269461-49cfd01504c1?auto=format&fit=crop&fm=jpg&q=82&w=1800';

const meetings = [
  { person: 'Maya Chen', type: 'Investor intro', status: 'Follow-up due', meta: 'Waiting 3 days', tone: 'orange', action: 'Send a personal nudge' },
  { person: 'Daniel Ortiz', type: 'Customer discovery', status: 'Booked', meta: 'Tue · 14:30', tone: 'green', action: 'Review call brief' },
  { person: 'Priya Shah', type: 'Candidate screen', status: 'Waiting', meta: 'Sent today', tone: 'blue', action: 'No action needed yet' },
];

const demoStates = [
  { label: 'Create', title: 'Start with the purpose.', copy: 'Set the meeting intent, duration, buffer and working window before you send anything.', metric: '30 min', detail: 'Investor intro · afternoons only' },
  { label: 'Offer', title: 'Offer a small set of good times.', copy: 'CallSync checks connected calendars and turns your rules into guest-ready availability.', metric: '6 slots', detail: 'Availability checked' },
  { label: 'Track', title: 'Know what happened after send.', copy: 'Waiting, booked and closed requests stay visible instead of disappearing into inbox history.', metric: '3 active', detail: '1 request needs attention' },
  { label: 'Prepare', title: 'Carry context into the call.', copy: 'The purpose and setup stay attached to the request so preparation starts with context.', metric: '1 brief', detail: 'Intent and meeting details ready' },
];

const capabilities = [
  { icon: 'spark', title: 'Curated availability', copy: 'Offer only the windows you actually want booked.', accent: 'violet' },
  { icon: 'pipeline', title: 'Meeting pipeline', copy: 'See waiting, booked and closed requests in one place.', accent: 'teal' },
  { icon: 'bell', title: 'Follow-up signals', copy: 'Surface requests that have waited long enough for attention.', accent: 'orange' },
  { icon: 'template', title: 'Intent templates', copy: 'Start sales, investor, recruiting and onboarding calls with structure.', accent: 'blue' },
  { icon: 'link', title: 'Guest booking', copy: 'Guests choose approved times without creating a CallSync account.', accent: 'pink' },
  { icon: 'mail', title: 'Notifications', copy: 'Keep both sides informed as a request becomes a meeting.', accent: 'green' },
];

const useCases = [
  { title: 'Founder sales', copy: 'Move a warm lead from “happy to chat” to a prepared conversation.', icon: '↗', accent: 'lime', tag: 'Customer discovery' },
  { title: 'Investor intros', copy: 'Protect focus time while keeping the purpose of the introduction attached.', icon: '◈', accent: 'violet', tag: 'Fundraising' },
  { title: 'Recruiting screens', copy: 'Give candidates a clean booking flow with interview context ready.', icon: '◎', accent: 'blue', tag: 'Hiring' },
  { title: 'Client onboarding', copy: 'Turn a signed agreement into a structured kickoff without another thread.', icon: '✓', accent: 'orange', tag: 'Delivery' },
];

const comparisonRows = [
  ['Meeting purpose', 'Usually kept elsewhere', 'Buried in the thread', 'Attached to the request'],
  ['Availability', 'Broad availability rules', 'Manual back-and-forth', 'Curated guest-ready slots'],
  ['Request status', 'Booking-focused', 'Manual', 'Waiting / booked / closed'],
  ['Follow-up attention', 'Manual', 'Manual', 'Surfaced in the pipeline'],
  ['Preparation context', 'Separate notes', 'Search the thread', 'Carried into the request'],
];

const faqs = [
  ['Is CallSync another Calendly?', 'CallSync is built for a different job: managing the lifecycle around high-value meetings, including intent, curated availability, request status, follow-up attention and preparation context.'],
  ['Does the guest need an account?', 'No. Guests can open a public booking link and choose from the times you approved.'],
  ['Which calendars are supported?', 'The current product supports Google Calendar and Microsoft Outlook calendar connections.'],
  ['What does early access cost?', 'CallSync is free during early access. Paid plans are not being advertised before those plans actually exist.'],
];

function Brand() {
  return (
    <span className="v4-brand" aria-label="CallSync">
      <span className="v4-brand-mark"><i /><i /></span>
      <strong>CallSync</strong>
    </span>
  );
}

function BrandIcon({ type }) {
  if (type === 'google') {
    return (
      <span className="v4-google-icon" aria-hidden="true">
        <span className="g-top" /><span className="g-left" /><span className="g-right" /><span className="g-bottom" /><b>31</b>
      </span>
    );
  }
  return (
    <span className="v4-outlook-icon" aria-hidden="true">
      <span className="o-book">O</span><span className="o-mail">✉</span>
    </span>
  );
}

function FeatureIcon({ name }) {
  const paths = {
    spark: <><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z"/><path d="M5 15l.9 2.6L8.5 18.5l-2.6.9L5 22l-.9-2.6-2.6-.9 2.6-.9L5 15Z"/></>,
    pipeline: <><rect x="3" y="4" width="18" height="4" rx="2"/><rect x="3" y="10" width="12" height="4" rx="2"/><rect x="3" y="16" width="16" height="4" rx="2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    template: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h7M7 16h5"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function PipelineCard({ active, setActive }) {
  const current = meetings[active];
  return (
    <div className="v4-pipeline-shell">
      <div className="v4-windowbar"><span><i/><i/><i/></span><b>Meeting pipeline</b><em><i/> Live</em></div>
      <div className="v4-pipeline-grid">
        <div className="v4-meeting-list">
          {meetings.map((meeting, index) => (
            <button type="button" key={meeting.person} className={index === active ? 'active' : ''} onClick={() => setActive(index)}>
              <span className="v4-avatar">{meeting.person.split(' ').map((word) => word[0]).join('')}</span>
              <span className="v4-meeting-person"><strong>{meeting.person}</strong><small>{meeting.type}</small></span>
              <span className={`v4-meeting-status ${meeting.tone}`}><i/><span><strong>{meeting.status}</strong><small>{meeting.meta}</small></span></span>
            </button>
          ))}
        </div>
        <div className="v4-action-panel" key={`${current.person}-${current.status}`}>
          <span className="v4-overline">Next action</span>
          <div className="v4-action-avatar"><span className="v4-avatar large">{current.person.split(' ').map((word) => word[0]).join('')}</span><span><strong>{current.person}</strong><small>{current.type}</small></span></div>
          <h3>{current.action}</h3>
          <p>{current.status === 'Follow-up due' ? 'The request has waited long enough to deserve attention.' : current.status === 'Booked' ? 'The time is confirmed. Move from scheduling into preparation.' : 'The request is fresh. Let the guest choose from the approved options.'}</p>
          <div className="v4-action-progress"><span className="done"/><span className="done"/><span className={current.status === 'Booked' ? 'done' : 'current'}/><span className={current.status === 'Booked' ? 'current' : ''}/></div>
        </div>
      </div>
    </div>
  );
}

function LandingPageV5() {
  const [activeMeeting, setActiveMeeting] = useState(0);
  const [demo, setDemo] = useState(0);
  const [openFaq, setOpenFaq] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  const hasToken = useMemo(() => Boolean(localStorage.getItem('token')), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const meetingTimer = window.setInterval(() => setActiveMeeting((value) => (value + 1) % meetings.length), 3900);
    const demoTimer = window.setInterval(() => setDemo((value) => (value + 1) % demoStates.length), 4700);
    return () => { window.clearInterval(meetingTimer); window.clearInterval(demoTimer); };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elements = document.querySelectorAll('[data-v4-reveal]');
    if (reduced || !('IntersectionObserver' in window)) {
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

  const appHref = hasToken ? '/dashboard' : '/login';
  const activeDemo = demoStates[demo];

  return (
    <main className="v4-page v5-page">
      <header className={`v4-nav-shell ${scrolled ? 'scrolled' : ''}`}>
        <nav className="v4-nav">
          <a href="/" aria-label="CallSync home"><Brand /></a>
          <div className="v4-nav-links">
            <a href="#product">Product</a><a href="#use-cases">Use cases</a><a href="#compare">Compare</a><a href="#pricing">Pricing</a>
          </div>
          <div className="v4-nav-actions"><a href="/login">Sign in</a><a className="v4-btn dark small" href={appHref}>{hasToken ? 'Open dashboard' : 'Try CallSync'}</a></div>
        </nav>
      </header>

      <section className="v5-hero">
        <div className="v5-hero-copy" data-v4-reveal>
          <span className="v4-pill"><i/> Early access · Free during beta</span>
          <h1>From “happy to chat” to a meeting you can actually manage.</h1>
          <p>CallSync turns high-value meeting requests into curated availability, visible status and useful context from the first invite to preparation.</p>
          <div className="v4-hero-actions"><a className="v4-btn primary" href={appHref}>{hasToken ? 'Open your pipeline' : 'Start free'}</a><a className="v4-btn ghost" href="#product">See it work <span>↓</span></a></div>
        </div>
        <div className="v5-hero-product" data-v4-reveal>
          <PipelineCard active={activeMeeting} setActive={setActiveMeeting} />
          <div className="v5-human-chip"><img src={HUMAN_CALL_PHOTO} alt="Professional on a video call"/><span><b>Daniel Ortiz · Customer discovery</b><small>Tue · 14:30 · 30 min</small></span></div>
        </div>
      </section>

      <section className="v5-integrations" data-v4-reveal>
        <span>Works with</span>
        <article><BrandIcon type="google"/><strong>Google Calendar</strong></article>
        <article><BrandIcon type="outlook"/><strong>Microsoft Outlook</strong></article>
        <p>One clean availability layer for the calendars you already use.</p>
      </section>

      <section className="v5-product" id="product">
        <div className="v5-product-head" data-v4-reveal>
          <span className="v4-overline light">Product walkthrough</span>
          <h2>One meeting. Four moments that matter.</h2>
          <p>Click through the lifecycle. The point is not more scheduling—it is keeping the request useful before and after the booking.</p>
        </div>
        <div className="v5-demo-layout">
          <div className="v5-demo-tabs" data-v4-reveal>
            {demoStates.map((state, index) => (
              <button type="button" key={state.label} className={index === demo ? 'active' : ''} onClick={() => setDemo(index)}>
                <span>0{index + 1}</span><strong>{state.label}</strong><small>{state.title}</small>
              </button>
            ))}
          </div>
          <div className="v5-demo-screen" data-v4-reveal>
            <div className="v4-demo-top"><span><i/><i/><i/></span><b>{activeDemo.label} view</b><em>CallSync</em></div>
            <div className="v5-demo-canvas" key={activeDemo.label}>
              <aside><span className="active">Pipeline</span><span>Requests</span><span>Calendar</span><span>Templates</span></aside>
              <div className="v5-demo-main">
                <span className="v4-overline">{activeDemo.label}</span>
                <h3>{activeDemo.title}</h3>
                <p>{activeDemo.copy}</p>
                <div className="v5-demo-metric"><strong>{activeDemo.metric}</strong><span>{activeDemo.detail}</span></div>
                <div className="v5-demo-lines"><i/><i/><i/></div>
                <button type="button">Continue</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="v4-capabilities v5-capabilities">
        <div className="v4-section-head" data-v4-reveal><div><span className="v4-overline">What CallSync does</span><h2>Six capabilities, one workspace.</h2></div><p>Each capability solves a different piece of the host workflow.</p></div>
        <div className="v4-capability-grid">
          {capabilities.map((item, index) => (
            <article key={item.title} className={`v4-capability ${item.accent}`} data-v4-reveal style={{ '--delay': `${index * 55}ms` }}>
              <span className="v4-feature-icon"><FeatureIcon name={item.icon}/></span><span className="v4-card-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="v4-use-cases v5-use-cases" id="use-cases">
        <div className="v4-section-head" data-v4-reveal><div><span className="v4-overline">Where it fits</span><h2>Use the same product differently.</h2></div><p>The meeting purpose changes the workflow and the context worth keeping.</p></div>
        <div className="v4-use-grid">
          {useCases.map((item) => (
            <article key={item.title} className={item.accent} data-v4-reveal>
              <span className="v4-use-icon">{item.icon}</span><span className="v5-use-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="v5-compare" id="compare">
        <div className="v5-compare-head" data-v4-reveal>
          <span className="v4-overline light">Why not just send a link?</span>
          <h2>The difference is what happens around the booking.</h2>
          <p>CallSync is not trying to replace every scheduling tool. It is designed for meeting requests where status, follow-up and context matter.</p>
        </div>
        <div className="v5-compare-table" data-v4-reveal>
          <div className="v5-compare-row header"><span>Workflow</span><span>Link-only</span><span>Email thread</span><span className="callsync">CallSync</span></div>
          {comparisonRows.map(([label, linkOnly, email, callsync]) => (
            <div className="v5-compare-row" key={label}><strong>{label}</strong><span>{linkOnly}</span><span>{email}</span><span className="callsync">{callsync}</span></div>
          ))}
        </div>
      </section>

      <section className="v5-pricing" id="pricing">
        <div className="v5-pricing-copy" data-v4-reveal>
          <span className="v4-overline">Pricing</span>
          <h2>Free while CallSync is in early access.</h2>
          <p>There is one real plan today. Paid tiers will only appear when those products and prices actually exist.</p>
          <div className="v5-roadmap"><span><b>Now</b> Beta access</span><i/><span><b>Later</b> Pro + team features</span></div>
        </div>
        <article className="v5-price-card" data-v4-reveal>
          <span className="v4-price-badge">Available now</span>
          <div className="v5-price-top"><div><h3>Early access</h3><p>The complete current CallSync experience.</p></div><div><strong>€0</strong><small>during beta</small></div></div>
          <ul><li><span>✓</span>Google + Outlook connections</li><li><span>✓</span>Meeting requests and booking links</li><li><span>✓</span>Meeting pipeline and status</li><li><span>✓</span>Intent templates and notifications</li></ul>
          <a className="v4-btn primary" href={appHref}>{hasToken ? 'Open your dashboard' : 'Start free'}</a>
        </article>
      </section>

      <section className="v5-trust" id="trust">
        <div className="v5-trust-copy" data-v4-reveal><span className="v4-overline light">Connection & access</span><h2>Simple enough to understand before you connect.</h2><p>Calendar access is authorized through Google or Microsoft OAuth. Guests use the public booking page instead of signing into CallSync.</p></div>
        <div className="v5-trust-grid">
          <article data-v4-reveal><span>01</span><strong>Provider authorization</strong><p>Connect through the calendar provider’s authorization flow rather than sharing a calendar password.</p></article>
          <article data-v4-reveal><span>02</span><strong>Guest stays lightweight</strong><p>The guest opens the booking link, chooses an approved time and does not need a CallSync account.</p></article>
        </div>
      </section>

      <section className="v4-faq v5-faq">
        <div className="v4-faq-title" data-v4-reveal><span className="v4-overline">FAQ</span><h2>Before your first booking.</h2></div>
        <div className="v4-faq-list" data-v4-reveal>
          {faqs.map(([question, answer], index) => (
            <article key={question} className={openFaq === index ? 'open' : ''}>
              <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button>
              <div><p>{answer}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="v4-final v5-final" data-v4-reveal><div><span className="v4-overline light">CallSync early access</span><h2>Turn the next interested reply into a meeting you can manage.</h2></div><div><p>Connect a calendar, create a focused request and keep the conversation visible.</p><a className="v4-btn white" href={appHref}>{hasToken ? 'Open your dashboard' : 'Start free'} <span>→</span></a></div></section>

      <footer className="v4-footer"><Brand/><p>Meeting CRM for high-value calls.</p><div><a href="#product">Product</a><a href="#compare">Compare</a><a href="#pricing">Pricing</a><a href="/login">Sign in</a></div></footer>
    </main>
  );
}

export default LandingPageV5;
