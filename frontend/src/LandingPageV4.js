import React, { useEffect, useMemo, useState } from 'react';
import './LandingPageV4.css';

const HUMAN_CALL_PHOTO = 'https://images.unsplash.com/photo-1758873269461-49cfd01504c1?auto=format&fit=crop&fm=jpg&q=82&w=1800';
const HUMAN_FOCUS_PHOTO = 'https://images.unsplash.com/photo-1758873272808-5580ed7deb44?auto=format&fit=crop&fm=jpg&q=82&w=1800';

const meetings = [
  { person: 'Maya Chen', type: 'Investor intro', status: 'Follow-up due', meta: 'Waiting 3 days', tone: 'orange', action: 'Send a personal nudge' },
  { person: 'Daniel Ortiz', type: 'Customer discovery', status: 'Booked', meta: 'Tue · 14:30', tone: 'green', action: 'Review call brief' },
  { person: 'Priya Shah', type: 'Candidate screen', status: 'Waiting', meta: 'Sent today', tone: 'blue', action: 'No action needed yet' },
];

const demoStates = [
  { label: 'Create', title: 'Start with why the meeting exists.', copy: 'Choose the meeting intent, duration, buffer and working window before you share anything.', metric: '30 min', detail: 'Investor intro · afternoons only' },
  { label: 'Offer', title: 'Show a small set of good times.', copy: 'CallSync checks your connected calendars and turns the rules into guest-ready availability.', metric: '6 slots', detail: 'Google + Outlook checked' },
  { label: 'Track', title: 'See what happened after send.', copy: 'Waiting, booked and closed requests stay visible instead of disappearing into email history.', metric: '3 active', detail: '1 follow-up needs attention' },
  { label: 'Prepare', title: 'Carry the meeting context forward.', copy: 'The purpose of the call and its setup stay attached to the request so preparation starts with context.', metric: '1 brief', detail: 'Intent and meeting details ready' },
];

const capabilities = [
  { icon: 'spark', title: 'Curated availability', copy: 'Offer only the windows you actually want booked instead of exposing an entire calendar.', accent: 'violet' },
  { icon: 'pipeline', title: 'Meeting pipeline', copy: 'Treat requests like active conversations with clear waiting, booked and closed states.', accent: 'teal' },
  { icon: 'bell', title: 'Follow-up risk', copy: 'Surface requests that have been waiting long enough to deserve a personal nudge.', accent: 'orange' },
  { icon: 'template', title: 'Intent templates', copy: 'Start sales, investor, recruiting and onboarding calls with the right structure.', accent: 'blue' },
  { icon: 'link', title: 'Public booking links', copy: 'Guests choose from approved options without needing a CallSync account.', accent: 'pink' },
  { icon: 'mail', title: 'Email notifications', copy: 'Keep hosts and guests informed as requests move from invite to confirmed meeting.', accent: 'green' },
];

const useCases = [
  { title: 'Founder sales', copy: 'Keep warm leads moving without turning your calendar into a free-for-all.', icon: '↗', accent: 'lime' },
  { title: 'Investor intros', copy: 'Protect focus time while making high-value introductions easy to convert into calls.', icon: '◈', accent: 'violet' },
  { title: 'Recruiting screens', copy: 'Give candidates a clean booking experience while keeping interview context attached.', icon: '◎', accent: 'blue' },
  { title: 'Client onboarding', copy: 'Move from signed agreement to a prepared kickoff without another coordination thread.', icon: '✓', accent: 'orange' },
];

const pricing = [
  {
    name: 'Beta',
    price: '€0',
    suffix: 'during early access',
    badge: 'Available now',
    copy: 'Use the product while CallSync is still being shaped with early users.',
    features: ['Google + Outlook connections', 'Meeting requests and booking links', 'Meeting pipeline', 'Email notifications'],
    cta: 'Start free',
    featured: true,
  },
  {
    name: 'Pro',
    price: 'Coming later',
    suffix: 'pricing not announced',
    badge: 'Planned',
    copy: 'For individuals who want deeper automation, preparation and follow-up workflows.',
    features: ['Everything in Beta', 'Advanced follow-up workflows', 'Richer meeting preparation', 'More automation'],
    cta: 'Join early access',
  },
  {
    name: 'Teams',
    price: 'Coming later',
    suffix: 'pricing not announced',
    badge: 'Planned',
    copy: 'For teams coordinating high-value meetings across shared processes and calendars.',
    features: ['Shared meeting workflows', 'Team-level visibility', 'Reusable playbooks', 'Administrative controls'],
    cta: 'Join early access',
  },
];

const faqs = [
  ['Is CallSync another Calendly?', 'No. Calendly is excellent at scheduling. CallSync is being built around the broader lifecycle of high-value meetings: intent, curated availability, request status, follow-up risk and preparation context.'],
  ['Does the guest need a CallSync account?', 'No. Guests can open the public booking link and choose from the times you approved.'],
  ['Which calendars can I connect?', 'The current product supports Google Calendar and Microsoft Outlook calendar connections through OAuth.'],
  ['Is CallSync free?', 'CallSync is free during early access. Future Pro and Teams pricing has not been announced yet.'],
  ['What happens after I send a request?', 'The request stays visible in your meeting pipeline, so you can see whether it is waiting, booked or closed and whether it needs attention.'],
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
          <p>{current.status === 'Follow-up due' ? 'The request has been waiting long enough to deserve attention.' : current.status === 'Booked' ? 'The time is confirmed. Move from scheduling into preparation.' : 'The request is fresh. Let the guest choose from the approved options.'}</p>
          <div className="v4-action-progress"><span className="done"/><span className="done"/><span className={current.status === 'Booked' ? 'done' : 'current'}/><span className={current.status === 'Booked' ? 'current' : ''}/></div>
        </div>
      </div>
    </div>
  );
}

function LandingPageV4() {
  const [activeMeeting, setActiveMeeting] = useState(0);
  const [demo, setDemo] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
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
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), { threshold: 0.12 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const appHref = hasToken ? '/dashboard' : '/login';
  const activeDemo = demoStates[demo];

  return (
    <main className="v4-page">
      <header className={`v4-nav-shell ${scrolled ? 'scrolled' : ''}`}>
        <nav className="v4-nav">
          <a href="/" aria-label="CallSync home"><Brand /></a>
          <div className="v4-nav-links">
            <a href="#product">Product</a><a href="#use-cases">Use cases</a><a href="#pricing">Pricing</a><a href="#trust">Trust</a>
          </div>
          <div className="v4-nav-actions"><a href="/login">Sign in</a><a className="v4-btn dark small" href={appHref}>{hasToken ? 'Open dashboard' : 'Try CallSync'}</a></div>
        </nav>
      </header>

      <section className="v4-hero">
        <div className="v4-hero-copy" data-v4-reveal>
          <span className="v4-pill"><i/> Early access · Free during beta</span>
          <h1>High-value meetings deserve more than a calendar link.</h1>
          <p>CallSync gives hosts control before the booking, visibility after the send, and context before the call.</p>
          <div className="v4-hero-actions"><a className="v4-btn primary" href={appHref}>{hasToken ? 'Open your pipeline' : 'Start free'}</a><a className="v4-btn ghost" href="#product">See the product <span>↓</span></a></div>
          <div className="v4-hero-note"><span><b>No guest account</b> required</span><span><b>Google + Outlook</b> supported</span></div>
        </div>
        <div className="v4-hero-visual" data-v4-reveal>
          <img src={HUMAN_CALL_PHOTO} alt="Professional on a video call" />
          <div className="v4-hero-photo-label"><i/><span><strong>Meeting in progress</strong><small>Context ready before the call</small></span></div>
          <div className="v4-hero-product"><PipelineCard active={activeMeeting} setActive={setActiveMeeting} /></div>
        </div>
      </section>

      <section className="v4-integrations" data-v4-reveal>
        <p>Works with the calendars you already use</p>
        <div className="v4-integration-row">
          <article className="google"><BrandIcon type="google"/><span><strong>Google Calendar</strong><small>OAuth calendar connection</small></span><b>Connected</b></article>
          <article className="outlook"><BrandIcon type="outlook"/><span><strong>Microsoft Outlook</strong><small>OAuth calendar connection</small></span><b>Connected</b></article>
          <div className="v4-integration-copy"><span className="v4-overline">One availability layer</span><strong>Check both. Offer one clean set of times.</strong></div>
        </div>
      </section>

      <section className="v4-problem">
        <div className="v4-problem-quote" data-v4-reveal><span className="v4-overline light">The moment before CallSync</span><blockquote>“Yes, happy to chat next week.”</blockquote></div>
        <div className="v4-problem-copy" data-v4-reveal><span className="v4-overline light">The gap</span><h2>Interest is not a booked meeting.</h2><p>There is still a purpose to define, a useful time to offer, a response to watch and a conversation to prepare for. CallSync owns that gap.</p></div>
      </section>

      <section className="v4-capabilities" id="product">
        <div className="v4-section-head" data-v4-reveal><div><span className="v4-overline">Product capabilities</span><h2>Six jobs. One meeting workspace.</h2></div><p>Instead of repeating the same scheduling story, each part of CallSync solves a different piece of the host workflow.</p></div>
        <div className="v4-capability-grid">
          {capabilities.map((item, index) => <article key={item.title} className={`v4-capability ${item.accent}`} data-v4-reveal style={{ '--delay': `${index * 55}ms` }}><span className="v4-feature-icon"><FeatureIcon name={item.icon}/></span><span className="v4-card-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}
        </div>
      </section>

      <section className="v4-demo">
        <div className="v4-demo-copy" data-v4-reveal>
          <span className="v4-overline light">Interactive product tour</span>
          <h2>See what changes at each stage.</h2>
          <div className="v4-demo-tabs">{demoStates.map((state, index) => <button type="button" key={state.label} className={index === demo ? 'active' : ''} onClick={() => setDemo(index)}><span>0{index + 1}</span>{state.label}</button>)}</div>
          <div className="v4-demo-text" key={activeDemo.label}><h3>{activeDemo.title}</h3><p>{activeDemo.copy}</p></div>
        </div>
        <div className="v4-demo-screen" data-v4-reveal>
          <div className="v4-demo-top"><span><i/><i/><i/></span><b>{activeDemo.label} view</b><em>CallSync</em></div>
          <div className="v4-demo-canvas" key={activeDemo.label}>
            <div className="v4-demo-sidebar"><span className="active">Pipeline</span><span>Requests</span><span>Calendar</span><span>Templates</span></div>
            <div className="v4-demo-main"><span className="v4-overline">{activeDemo.label}</span><h3>{activeDemo.title}</h3><div className="v4-demo-metric"><strong>{activeDemo.metric}</strong><span>{activeDemo.detail}</span></div><div className="v4-demo-lines"><i/><i/><i/></div><button type="button">Continue</button></div>
          </div>
        </div>
      </section>

      <section className="v4-use-cases" id="use-cases">
        <div className="v4-section-head" data-v4-reveal><div><span className="v4-overline">Built for consequential calls</span><h2>Different meetings need different context.</h2></div><p>CallSync starts from the purpose of the conversation, not from one generic booking template.</p></div>
        <div className="v4-use-grid">{useCases.map((item) => <article key={item.title} className={item.accent} data-v4-reveal><span className="v4-use-icon">{item.icon}</span><h3>{item.title}</h3><p>{item.copy}</p><a href={appHref}>Use this workflow <span>→</span></a></article>)}</div>
      </section>

      <section className="v4-human">
        <div className="v4-human-photo" data-v4-reveal><img src={HUMAN_FOCUS_PHOTO} alt="Professional preparing for an online meeting"/><span className="v4-human-tag"><i/><b>Prepared, not just booked</b></span></div>
        <div className="v4-human-copy" data-v4-reveal><span className="v4-overline light">The software stops at the right moment</span><h2>Scheduling is software. The meeting is human.</h2><p>The goal is not to automate every interaction. It is to remove coordination work so the host can spend attention on the conversation itself.</p><div className="v4-human-points"><span><b>Less coordination</b><small>Curated slots and public booking links</small></span><span><b>More context</b><small>Intent stays attached to the meeting</small></span><span><b>Clear next action</b><small>Waiting requests do not disappear</small></span></div></div>
      </section>

      <section className="v4-pricing" id="pricing">
        <div className="v4-section-head" data-v4-reveal><div><span className="v4-overline">Pricing</span><h2>Simple while we are early.</h2></div><p>CallSync is free during early access. Future paid pricing is intentionally not being invented before the product is ready for it.</p></div>
        <div className="v4-price-grid">{pricing.map((plan) => <article key={plan.name} className={plan.featured ? 'featured' : ''} data-v4-reveal><span className="v4-price-badge">{plan.badge}</span><h3>{plan.name}</h3><strong className="v4-price">{plan.price}</strong><small>{plan.suffix}</small><p>{plan.copy}</p><ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul><a className={`v4-btn ${plan.featured ? 'primary' : 'ghost'}`} href={appHref}>{plan.cta}</a></article>)}</div>
      </section>

      <section className="v4-trust" id="trust">
        <div className="v4-trust-copy" data-v4-reveal><span className="v4-overline light">Trust without theatre</span><h2>Your calendar connection should be understandable.</h2><p>CallSync currently connects Google Calendar and Microsoft Outlook through OAuth. You authorize the calendar connection instead of handing CallSync your calendar password.</p><a href={appHref}>Connect your calendar <span>→</span></a></div>
        <div className="v4-trust-cards">
          <article data-v4-reveal><span className="v4-trust-icon blue">G</span><div><strong>Google OAuth</strong><small>Connect your Google calendar using Google’s authorization flow.</small></div></article>
          <article data-v4-reveal><span className="v4-trust-icon cyan">O</span><div><strong>Microsoft OAuth</strong><small>Connect Outlook calendar using Microsoft’s authorization flow.</small></div></article>
          <article data-v4-reveal><span className="v4-trust-icon green">✓</span><div><strong>No guest login</strong><small>Your guest can use the public booking page without creating a CallSync account.</small></div></article>
        </div>
      </section>

      <section className="v4-faq">
        <div className="v4-faq-title" data-v4-reveal><span className="v4-overline">FAQ</span><h2>Questions worth answering before the first booking.</h2></div>
        <div className="v4-faq-list" data-v4-reveal>{faqs.map(([question, answer], index) => <article key={question} className={openFaq === index ? 'open' : ''}><button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button><div><p>{answer}</p></div></article>)}</div>
      </section>

      <section className="v4-final" data-v4-reveal><div><span className="v4-overline light">CallSync early access</span><h2>Make the next meeting easier to book—and harder to lose.</h2></div><div><p>Start free, connect a calendar and create your first focused request.</p><a className="v4-btn white" href={appHref}>{hasToken ? 'Open your dashboard' : 'Start free'} <span>→</span></a></div></section>

      <footer className="v4-footer"><Brand/><p>Meeting CRM for high-value calls.</p><div><a href="#product">Product</a><a href="#pricing">Pricing</a><a href="/login">Sign in</a></div></footer>
    </main>
  );
}

export default LandingPageV4;
