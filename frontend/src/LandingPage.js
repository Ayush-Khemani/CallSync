import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';

const scenarios = [
  { label: 'Schedule a call', prompt: 'Find time for a 30 minute call with Maya next week.', response: 'I can check your connected calendars and prepare a few afternoon options.', title: 'A focused set of times', detail: 'Choose the times you want to offer. Review the guest and message before creating the request.', chips: ['30 minutes', 'Next week', 'Afternoon'], result: 'Ready for your review' },
  { label: 'Prepare for a meeting', prompt: 'Prepare me for my next meeting with Maya.', response: 'I can bring the meeting context, previous notes and open commitments together.', title: 'Walk in with the context', detail: 'Review the purpose of the conversation, previous meeting memory and suggested next steps in one brief.', chips: ['Meeting context', 'Previous notes', 'Open tasks'], result: 'Preparation stays editable' },
  { label: 'Draft a follow up', prompt: 'Draft a follow up for Maya about our next steps.', response: 'I can prepare a message using the meeting context. You can edit it before sending.', title: 'The next step, already drafted', detail: 'Review the recipient, message and connected mailbox. Sending always needs your approval.', chips: ['Editable draft', 'Connected mailbox', 'Your approval'], result: 'Nothing sent without approval' },
];

const faqs = [
  ['Which calendars can I connect?', 'CallSync supports Google Calendar and Microsoft Outlook. It can check availability across connected calendars when preparing meeting options.'],
  ['Does the AI send messages or change my calendar on its own?', 'No. Creating a meeting request, sending a follow up, cancelling a meeting and rescheduling require approval. Reading context and preparing drafts can happen without that extra step.'],
  ['Does my guest need a CallSync account?', 'Guests can choose from your offered times through a booking link without creating a CallSync account.'],
  ['How does meeting preparation work?', 'CallSync can prepare an editable brief from the meeting context, previous meeting memory and open commitments. Review the brief before your conversation.'],
  ['Can I keep track of commitments after a call?', 'Yes. CallSync keeps meeting outcomes, tasks and relationship history as structured records. You can complete or reopen internal tasks from the AI workspace or the Tasks view.'],
  ['What happens if a connected provider fails?', 'CallSync keeps provider failures visible. If calendar availability cannot be verified, it does not treat that calendar as free. A failed send is not shown as a successful delivery.'],
];

export function BrandMark() {
  return <span className="cs-brand title-2"><span className="cs-mark" aria-hidden="true"><span /><span /></span>CallSync<span className="cs-brand-period">.</span></span>;
}

function ActionLink({ href, className = '' }) {
  return <a className={`cs-button button-md ${className}`} href={href}>Open CallSync <span aria-hidden="true">↗</span></a>;
}

function ProductPreview() {
  const [selected, setSelected] = useState(0);
  const item = scenarios[selected];
  const tabs = useRef([]);
  function moveTab(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % scenarios.length;
    if (event.key === 'ArrowLeft') next = (index + scenarios.length - 1) % scenarios.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = scenarios.length - 1;
    if (next !== undefined) { event.preventDefault(); setSelected(next); tabs.current[next]?.focus(); }
  }
  return <div className="cs-preview" id="demo">
    <div className="cs-preview-bar"><span className="caption-4"><span className="cs-status-dot" /> The CallSync workspace</span><span className="cs-demo-label caption-4">Interactive example · fictional data</span></div>
    <div className="cs-preview-body">
      <aside className="cs-preview-sidebar" aria-label="Workspace preview"><BrandMark /><span className="cs-sidebar-active title-4">↗ <span>AI workspace</span></span><span className="title-4">Today</span><span className="title-4">Meetings</span><span className="title-4">People</span><span className="title-4">Tasks</span><div className="cs-sidebar-foot"><span className="cs-status-dot" /><span className="caption-4">Your context, connected</span></div></aside>
      <div className="cs-chat">
        <div className="cs-chat-heading"><span className="caption-3">LESS COORDINATING. MORE CONVERSATION.</span><h2 className="heading-5">What would you like to get done?</h2></div>
        <div className="cs-demo-tabs" role="tablist" aria-label="Explore CallSync workflows">{scenarios.map((scenario, index) => <button className="caption-1" key={scenario.label} id={`workflow-tab-${index}`} ref={element => { tabs.current[index] = element; }} type="button" role="tab" aria-selected={selected === index} aria-controls="workflow-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => moveTab(event, index)}>{scenario.label}</button>)}</div>
        <div id="workflow-panel" role="tabpanel" tabIndex={0} aria-labelledby={`workflow-tab-${selected}`}>
          <div className="cs-user-message body-5" key={`prompt-${selected}`}>{item.prompt}<span className="cs-user-avatar caption-3" aria-hidden="true">YO</span></div>
          <div className="cs-agent-message" key={`response-${selected}`}><span className="cs-agent-avatar" aria-hidden="true"><span className="cs-mark"><span /><span /></span></span><div><p className="body-6">{item.response}</p><article className="cs-proposal"><div className="cs-proposal-label caption-3"><span className="cs-status-dot" /> {item.result}</div><h3 className="title-1">{item.title}</h3><p className="body-6">{item.detail}</p><div className="cs-proposal-chips">{item.chips.map(chip => <span key={chip} className="caption-4">{chip}</span>)}</div></article></div></div>
        </div>
        <div className="cs-composer caption-2"><span>One conversation. The whole meeting workflow.</span><span className="cs-composer-arrow" aria-hidden="true">↑</span></div>
      </div>
    </div>
  </div>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const menu = useRef(null);
  const page = useRef(null);
  const appHref = localStorage.getItem('token') ? '/dashboard' : '/login';

  useEffect(() => {
    const elements = page.current.querySelectorAll('[data-reveal]');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;
    elements.forEach(element => element.classList.add('cs-pending'));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.remove('cs-pending'); observer.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    elements.forEach(element => observer.observe(element));
    const words = Array.from(page.current.querySelectorAll('[data-word]'));
    const tagline = page.current.querySelector('.cs-tagline h2');
    let frame = null;
    // Distribute individual word triggers across the viewport crossing range.
    function revealWords() {
      frame = null;
      const progress = Math.max(0, Math.min(1, (window.innerHeight * 0.85 - tagline.getBoundingClientRect().top) / (window.innerHeight * 0.5)));
      words.forEach((word, index) => word.classList.toggle('cs-word-muted', progress < (index + 1) / words.length));
    }
    function queueReveal() { if (frame === null) frame = window.requestAnimationFrame(revealWords); }
    revealWords();
    window.addEventListener('scroll', queueReveal, { passive: true });
    window.addEventListener('resize', queueReveal);
    return () => { observer.disconnect(); window.removeEventListener('scroll', queueReveal); window.removeEventListener('resize', queueReveal); if (frame !== null) window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menu.current?.querySelector('a')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
      if (event.key === 'Tab') {
        const links = Array.from(menu.current.querySelectorAll('a'));
        const focusable = [menuButton.current, ...links];
        const current = focusable.indexOf(document.activeElement);
        if (event.shiftKey && current === 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
      }
    }
    window.addEventListener('keydown', handleKey);
    const desktop = window.matchMedia('(min-width: 769px)');
    const closeOnDesktop = event => { if (event.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey); desktop.removeEventListener('change', closeOnDesktop); };
  }, [menuOpen]);

  return <div className="cs-landing" ref={page}>
    <a className="cs-skip button-sm" href="#main">Skip to content</a>
    <header className="cs-nav-shell"><nav className="cs-nav" aria-label="Main navigation"><a href="/" aria-label="CallSync home" aria-current="page"><BrandMark /></a><div className="cs-desktop-links title-4"><a href="#product">Why CallSync</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></div><a className="cs-nav-action button-sm" href={appHref}>Open CallSync <span aria-hidden="true">↗</span></a><button ref={menuButton} className={`cs-menu-toggle ${menuOpen ? 'is-open' : ''}`} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><span /><span /></button></nav></header>
    {menuOpen && <div className="cs-mobile-menu" id="mobile-navigation" ref={menu} role="dialog" aria-modal="true" aria-label="Navigation"><nav aria-label="Mobile navigation">{[['Why CallSync', '#product'], ['How it works', '#how-it-works'], ['FAQ', '#faq'], ['Open CallSync', appHref]].map(([label, href], index) => <a className="heading-4" href={href} key={label} style={{ '--item-delay': `${index * 60}ms` }} onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }}>{label}<span aria-hidden="true">↗</span></a>)}</nav><span className="caption-2">A little less admin. A little more human.</span></div>}
    <main id="main" tabIndex={-1}>
      <section className="cs-hero cs-container" aria-labelledby="hero-title">
        <div className="cs-eyebrow caption-3"><span className="cs-status-dot" /> YOUR AI MEETING OPERATOR</div>
        <h1 id="hero-title" className="heading-1">Your meetings, handled.<br />Your attention, back.</h1>
        <p className="body-3 cs-hero-description">For founders and client teams with a conversation to move forward. Schedule calls, arrive prepared, and keep commitments moving in one AI workspace.</p>
        <ActionLink href={appHref} />
        <p className="caption-2 cs-hero-note">You stay in control. External actions need your approval.</p>
        <ProductPreview />
        <div className="cs-integrations"><span className="caption-2">Works with your calendar</span><div className="title-3"><span className="cs-google" aria-hidden="true">G</span>Google Calendar</div><div className="title-3"><span className="cs-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>Microsoft Outlook</div></div>
      </section>
      <section className="cs-benefits cs-container" id="product" aria-labelledby="benefits-title" data-reveal>
        <div className="cs-section-intro"><span className="cs-eyebrow caption-3">BEFORE, BETWEEN, AND AFTER THE CALL</span><h2 className="heading-2" id="benefits-title">Good conversations.<br />Less coordination.</h2><p className="body-3">The work around a meeting should never get in the way of the meeting itself.</p></div>
        <div className="cs-benefit-grid">
          <article className="cs-benefit cs-benefit-large"><span className="caption-3 cs-index">01 / FIND THE TIME</span><h3 className="heading-5">Skip the calendar back and forth.</h3><p className="body-3">Describe who you want to meet. CallSync checks your connected calendars and prepares times for you to review.</p><div className="cs-calendar-art" aria-label="Illustrative calendar availability"><div className="cs-calendar-day title-4">Tuesday<span className="caption-2">Afternoon availability</span></div><div className="cs-time-grid">{['13:30', '14:30', '16:00'].map((time, index) => <span className={`title-4 ${index === 1 ? 'cs-time-selected' : ''}`} key={time}>{time}{index === 1 && <span aria-hidden="true">✓</span>}</span>)}</div><span className="caption-4">Illustrative times · checked against your calendars</span></div></article>
          <article className="cs-benefit"><span className="caption-3 cs-index">02 / ARRIVE PREPARED</span><h3 className="heading-5">Pick up where you left off.</h3><p className="body-3">Bring previous notes, meeting context and open commitments into an editable brief before the call.</p><div className="cs-note-art"><span className="caption-3">YOUR NEXT CONVERSATION</span><span className="title-4">The context. The open questions.</span><span className="caption-2">Together before you join.</span></div></article>
          <article className="cs-benefit"><span className="caption-3 cs-index">03 / KEEP THINGS MOVING</span><h3 className="heading-5">Leave with a next step.</h3><p className="body-3">Prepare a follow up, track what you owe and keep the relationship history close. The conversation carries forward.</p><div className="cs-task-art title-4"><span aria-hidden="true">✓</span> A commitment, kept.<span className="caption-4">Meeting outcomes become visible tasks.</span></div></article>
        </div>
      </section>
      <section className="cs-tagline" aria-label="Less admin, more presence"><div className="cs-container"><span className="caption-3 cs-eyebrow">MAKE ROOM FOR THE HUMAN PART</span><h2 className="heading-1" aria-label="Be in the conversation. We'll keep the context.">{['Be in the conversation.', "We’ll keep the context."].map(line => <span className="cs-tagline-line" key={line} aria-hidden="true">{line.split(' ').map((word, index) => <span data-word key={`${word}-${index}`}>{word}{' '}</span>)}</span>)}</h2><p className="body-3">Less time piecing things together.<br />More attention for the person in front of you.</p></div></section>
      <section className="cs-how cs-container" id="how-it-works" data-reveal><div className="cs-section-intro"><span className="cs-eyebrow caption-3">FROM INTENT TO NEXT STEP</span><h2 className="heading-2">Tell it what you need.<br />Keep the final say.</h2></div><div className="cs-steps">{[
        ['Connect your calendar.', 'Bring Google Calendar or Outlook into CallSync so meeting options reflect your availability.'],
        ['Describe the outcome.', 'Ask to schedule a conversation, prepare for a meeting or draft a follow up. Start with what you want done.'],
        ['Review, then approve.', 'Check the proposal before an email goes out or a calendar changes. Your approval moves it forward.'],
      ].map(([title, copy], index) => <article key={title}><span className="cs-step-number heading-4">0{index + 1}</span><h3 className="heading-6">{title}</h3><p className="body-3">{copy}</p></article>)}</div></section>
      <section className="cs-control cs-container" data-reveal><div className="cs-control-copy"><span className="caption-3 cs-eyebrow">A CAPABLE OPERATOR. YOUR CALL.</span><h2 className="heading-3">Helpful by default.<br />Accountable by design.</h2><p className="body-3">CallSync can read context and prepare the next step. You approve the actions that reach other people or change your calendar.</p><a className="cs-text-link button-sm" href="https://github.com/Ayush-Khemani/CallSync#agent-safety-model" target="_blank" rel="noreferrer">Explore the approval model <span aria-hidden="true">↗</span></a></div><div className="cs-control-list">{[['Read and prepare', 'Meeting context, availability and draft messages', 'Prepared for you'], ['Send and schedule', 'Emails, invitations and calendar changes', 'Approved by you']].map(([title, detail, badge]) => <article key={title}><span className="cs-control-check title-1" aria-hidden="true">✓</span><div><h3 className="title-3">{title}</h3><p className="body-6">{detail}</p><span className="caption-3">{badge}</span></div></article>)}</div></section>
      <section className="cs-faq cs-container" id="faq" data-reveal><div className="cs-section-intro"><span className="cs-eyebrow caption-3">A FEW THINGS YOU MIGHT ASK</span><h2 className="heading-2">Clear before<br />you connect.</h2><p className="body-3">Your calendar, your context,<br />your control.</p></div><div className="cs-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary className="title-3">{question}<span className="cs-faq-plus" aria-hidden="true" /></summary><p className="body-3">{answer}</p></details>)}</div></section>
      <section className="cs-final" data-reveal><div className="cs-container"><span className="cs-eyebrow caption-3">LESS ADMIN STARTS WITH A CONVERSATION</span><h2 className="heading-2">Your next meeting<br />starts here.</h2><ActionLink href={appHref} /><p className="caption-2">Prepare first. Review clearly. Approve when you’re ready.</p></div></section>
    </main>
    <footer className="cs-footer cs-container"><a href="/" aria-label="CallSync home"><BrandMark /></a><p className="caption-2">A little less admin. A little more human.</p><nav aria-label="Footer navigation" className="caption-1"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/Ayush-Khemani/CallSync" target="_blank" rel="noreferrer">GitHub ↗</a></nav></footer>
  </div>;
}

export function LandingInfoPage({ kind }) {
  const isPrivacy = kind === 'privacy';
  const isTerms = kind === 'terms';
  const title = isPrivacy ? 'Privacy information' : isTerms ? 'Terms of use' : 'Page not found.';
  return <div className="cs-landing cs-info"><a className="cs-skip button-sm" href="#main">Skip to content</a><header className="cs-container"><a href="/" aria-label="CallSync home"><BrandMark /></a></header><main className="cs-container" id="main"><span className="caption-3 cs-eyebrow">{isPrivacy || isTerms ? 'CALLSYNC / SERVICE INFORMATION' : 'CALLSYNC / 404'}</span><h1 className="heading-2">{title}</h1>{isPrivacy ? <><p className="body-3">CallSync uses account details, connected calendar and mailbox access, meeting records, notes and tasks to support your meeting workflows. Conversations and approval requests are persisted by the application.</p><h2 className="heading-5">Connected services and AI</h2><p className="body-3">Calendar and mail workflows use Google or Microsoft services. When AI is configured, the backend uses an AI provider to interpret requests and prepare responses using relevant workspace context.</p><h2 className="heading-5">Policy status</h2><p className="body-3">This is a product data summary based on the repository, not a complete privacy policy. Retention periods, deletion procedures, the responsible operator and a privacy contact have not been published here. Confirm these details with the project owner before connecting sensitive information.</p></> : isTerms ? <><p className="body-3">CallSync is an evolving meeting operations project. This page describes current behavior; the project owner has not supplied formal service terms, pricing, support commitments or guarantees.</p><h2 className="heading-5">Review before you approve</h2><p className="body-3">Review recipients, proposed times and message content before approving external actions. AI prepared content can need correction. Connected calendar and email functionality depends on provider access and configuration.</p><h2 className="heading-5">Project information</h2><p className="body-3">Consult the project repository for implementation status and known verification work. Formal legal terms require the project owner’s review before commercial use.</p></> : <p className="body-3">We couldn’t find that page. Return to CallSync to continue.</p>}<a className="cs-button button-md" href="/">Back to CallSync <span aria-hidden="true">↗</span></a></main></div>;
}
