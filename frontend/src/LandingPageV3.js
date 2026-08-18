import React, { useEffect, useState } from 'react';
import './LandingPageV2.css';
import './LandingPageV3.css';

const HUMAN_CALL_PHOTO = 'https://images.unsplash.com/photo-1758873269461-49cfd01504c1?auto=format&fit=crop&fm=jpg&q=82&w=1800';
const HUMAN_FOCUS_PHOTO = 'https://images.unsplash.com/photo-1758873272808-5580ed7deb44?auto=format&fit=crop&fm=jpg&q=82&w=1800';

const pipelineMeetings = [
  {
    person: 'Maya Chen',
    type: 'Investor intro',
    state: 'Follow-up due',
    meta: 'Sent 3 days ago',
    tone: 'attention',
    detail: 'The invite has been waiting for 3 days. Send a personal nudge before the conversation goes cold.',
    action: 'Send a personal nudge',
    stage: 2,
  },
  {
    person: 'Daniel Ortiz',
    type: 'Customer discovery',
    state: 'Booked',
    meta: 'Tue · 14:30',
    tone: 'success',
    detail: 'The meeting is booked. Review the call intent and walk in with the context you captured when the request was created.',
    action: 'Review call brief',
    stage: 3,
  },
  {
    person: 'Priya Shah',
    type: 'Candidate screen',
    state: 'Waiting',
    meta: 'Sent today',
    tone: 'neutral',
    detail: 'This invite went out today. No follow-up is needed yet — the guest still has room to choose an approved time.',
    action: 'View request',
    stage: 1,
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

const journeyStates = [
  {
    label: 'Reply',
    title: 'Interest appears in your inbox.',
    copy: '“Yes, happy to chat next week.” The conversation has momentum, but there is no meeting yet.',
    eyebrow: 'Interested reply',
    cardTitle: 'Investor intro',
    cardMeta: 'Maya Chen · warm introduction',
  },
  {
    label: 'Invite',
    title: 'Turn intent into a structured request.',
    copy: 'Choose the purpose, duration, working window, buffer, and the questions that make the call worth having.',
    eyebrow: 'Focused request',
    cardTitle: '30 minutes · afternoons',
    cardMeta: '15 min buffer · 4 context prompts',
  },
  {
    label: 'Book',
    title: 'Offer a small set of good options.',
    copy: 'Connected calendars are checked and the guest sees curated availability instead of your whole schedule.',
    eyebrow: 'Availability ready',
    cardTitle: '6 approved slots',
    cardMeta: 'Google + Outlook checked',
  },
  {
    label: 'Follow up',
    title: 'Know when the conversation needs you.',
    copy: 'A request that is still waiting does not disappear into inbox history. CallSync surfaces the next action.',
    eyebrow: 'Next action',
    cardTitle: 'Follow-up due',
    cardMeta: 'Waiting 3 days · personal nudge',
  },
];

const callTypes = [
  ['Founder sales', 'Qualify customer pain, urgency, and the next commercial step.'],
  ['Investor intro', 'Keep fundraising conversations focused on stage fit and the highest-value topic.'],
  ['Recruiting screen', 'Structure role fit, timing, and the discussion points that matter before the interview.'],
  ['Client onboarding', 'Align outcome, stakeholders, constraints, and next steps before kickoff.'],
];

const railItems = [
  'Google Calendar',
  'Outlook Calendar',
  'Curated availability',
  'Intent templates',
  'Booking links',
  'Follow-up risk',
  'Email notifications',
  'Meeting pipeline',
];

function Logo() {
  return (
    <span className="homev2-logo" aria-label="CallSync">
      <span className="homev2-logo-mark">CS</span>
      <strong>CallSync</strong>
    </span>
  );
}

function PipelinePreview({ activeMeeting, onSelect }) {
  const meeting = pipelineMeetings[activeMeeting];
  const timeline = ['Reply received', 'Invite sent', 'Follow-up', 'Booked'];

  return (
    <div className="homev2-product homev3-product" aria-label="Animated CallSync meeting pipeline preview">
      <div className="homev2-product-bar">
        <div>
          <span className="homev2-window-dot" />
          <span className="homev2-window-dot" />
          <span className="homev2-window-dot" />
        </div>
        <span>Meeting pipeline</span>
        <span className="homev3-live-label"><i /> Live</span>
      </div>

      <div className="homev2-product-body">
        <div className="homev2-pipeline-list">
          <div className="homev2-list-heading">
            <span>Conversation</span>
            <span>Status</span>
          </div>
          {pipelineMeetings.map((item, index) => (
            <button
              className={`homev2-pipeline-row homev3-pipeline-row ${index === activeMeeting ? 'is-selected' : ''}`}
              key={item.person}
              onClick={() => onSelect(index)}
              type="button"
            >
              <div className="homev2-person">
                <span className="homev2-avatar">{item.person.split(' ').map((part) => part[0]).join('')}</span>
                <span>
                  <strong>{item.person}</strong>
                  <small>{item.type}</small>
                </span>
              </div>
              <div className="homev2-row-status">
                <span className={`homev2-status-dot ${item.tone}`} />
                <span>
                  <strong>{item.state}</strong>
                  <small>{item.meta}</small>
                </span>
              </div>
            </button>
          ))}
        </div>

        <aside className="homev2-next-action homev3-next-action" key={`${meeting.person}-${meeting.state}`}>
          <span className="homev2-mini-label">Next action</span>
          <div className="homev2-action-person">
            <span className="homev2-avatar large">{meeting.person.split(' ').map((part) => part[0]).join('')}</span>
            <div>
              <strong>{meeting.person}</strong>
              <small>{meeting.type} · 30 min</small>
            </div>
          </div>
          <p>{meeting.detail}</p>
          <button type="button">{meeting.action}</button>

          <div className="homev2-timeline" aria-label="Meeting lifecycle">
            {timeline.map((item, index) => (
              <div className={index < meeting.stage ? 'done' : index === meeting.stage ? 'current' : ''} key={item}>
                <span />{item}<small>{index < meeting.stage ? 'Done' : index === meeting.stage ? 'Now' : 'Next'}</small>
              </div>
            ))}
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

function TrustRail() {
  const repeated = [...railItems, ...railItems];
  return (
    <section className="homev3-rail" aria-label="CallSync capabilities">
      <div className="homev3-rail-label">Built into the workflow</div>
      <div className="homev3-rail-window">
        <div className="homev3-rail-track">
          {repeated.map((item, index) => <span key={`${item}-${index}`}><i />{item}</span>)}
        </div>
      </div>
    </section>
  );
}

function JourneyDemo({ activeJourney, setActiveJourney }) {
  const state = journeyStates[activeJourney];
  return (
    <div className="homev3-journey-grid">
      <div className="homev3-journey-tabs" role="tablist" aria-label="Meeting lifecycle demo">
        {journeyStates.map((item, index) => (
          <button
            aria-selected={index === activeJourney}
            className={index === activeJourney ? 'is-active' : ''}
            key={item.label}
            onClick={() => setActiveJourney(index)}
            role="tab"
            type="button"
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>

      <div className="homev3-journey-stage" key={state.label}>
        <div className="homev3-journey-copy">
          <p className="homev2-kicker">{state.eyebrow}</p>
          <h3>{state.title}</h3>
          <p>{state.copy}</p>
        </div>
        <div className="homev3-journey-card">
          <div className="homev3-journey-card-top"><span>CallSync</span><span>{state.label}</span></div>
          <div className="homev3-journey-card-body">
            <span className="homev3-motion-orb"><i /></span>
            <div>
              <small>{state.eyebrow}</small>
              <strong>{state.cardTitle}</strong>
              <p>{state.cardMeta}</p>
            </div>
          </div>
          <div className="homev3-progress"><span style={{ width: `${((activeJourney + 1) / journeyStates.length) * 100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function LandingPageV3() {
  const hasToken = Boolean(localStorage.getItem('token'));
  const [activeMeeting, setActiveMeeting] = useState(0);
  const [activeJourney, setActiveJourney] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const meetingTimer = window.setInterval(() => {
      setActiveMeeting((current) => (current + 1) % pipelineMeetings.length);
    }, 4200);
    const journeyTimer = window.setInterval(() => {
      setActiveJourney((current) => (current + 1) % journeyStates.length);
    }, 3600);

    return () => {
      window.clearInterval(meetingTimer);
      window.clearInterval(journeyTimer);
    };
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));

    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px' });

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="homev2 homev3">
      <header className={`homev2-nav-shell homev3-nav-shell ${scrolled ? 'is-scrolled' : ''}`}>
        <nav className="homev2-nav" aria-label="Primary navigation">
          <a className="homev2-brand-link" href="/" aria-label="CallSync home"><Logo /></a>
          <div className="homev2-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#people">For real conversations</a>
            <a href="#use-cases">Use cases</a>
            <a href="/login">Sign in</a>
            <a className="homev2-nav-cta" href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open dashboard' : 'Try CallSync'}</a>
          </div>
        </nav>
      </header>

      <section className="homev2-hero homev3-hero">
        <div className="homev2-hero-copy homev3-hero-copy">
          <div className="homev3-hero-badge"><span className="homev3-pulse" />Meeting CRM for high-value calls</div>
          <h1>Turn “sounds good” into a meeting that actually happens.</h1>
          <p className="homev2-lede">
            CallSync takes over where the interested reply ends: create a focused invite, offer curated availability, track booking status, and know when a conversation needs a follow-up.
          </p>
          <div className="homev2-actions">
            <a className="homev2-primary" href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open your pipeline' : 'Create a meeting request'}<span aria-hidden="true">↗</span></a>
            <a className="homev2-secondary" href="#how-it-works">Watch the workflow <span aria-hidden="true">↓</span></a>
          </div>
          <div className="homev3-hero-proof">
            <span><b>01</b> Connect calendars</span>
            <span><b>02</b> Send curated slots</span>
            <span><b>03</b> Track the next action</span>
          </div>
        </div>

        <div className="homev3-hero-visual" aria-label="A real conversation paired with the CallSync product workflow">
          <figure className="homev3-hero-photo">
            <img src={HUMAN_CALL_PHOTO} alt="A professional joining a video call from a modern office" />
            <figcaption><span>Meetings are human.</span><strong>The workflow around them should feel effortless.</strong></figcaption>
          </figure>
          <div className="homev3-product-wrap">
            <PipelinePreview activeMeeting={activeMeeting} onSelect={setActiveMeeting} />
          </div>
          <div className="homev3-floating-note"><span>Next action surfaced</span><strong>{pipelineMeetings[activeMeeting].action}</strong></div>
        </div>
      </section>

      <TrustRail />

      <section className="homev2-reply-section homev3-reply-section" data-reveal>
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

      <section className="homev3-interactive-story" id="how-it-works" data-reveal>
        <div className="homev2-section-head">
          <p className="homev2-kicker">See the meeting move</p>
          <h2>One workflow. Four moments that should stay connected.</h2>
          <p>The product story changes as the meeting moves forward. Choose a stage, or let the demo move on its own.</p>
        </div>
        <JourneyDemo activeJourney={activeJourney} setActiveJourney={setActiveJourney} />
      </section>

      <section className="homev2-lifecycle homev3-lifecycle" data-reveal>
        <div className="homev2-section-head">
          <p className="homev2-kicker">One visible lifecycle</p>
          <h2>From interested reply to prepared call.</h2>
          <p>CallSync is designed around the host’s workflow, not around producing another generic calendar page.</p>
        </div>
        <div className="homev2-lifecycle-list">
          {lifecycle.map((step, index) => (
            <article key={step.number} style={{ '--reveal-delay': `${index * 70}ms` }}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="homev3-people" id="people" data-reveal>
        <div className="homev3-people-photo">
          <img src={HUMAN_FOCUS_PHOTO} alt="A professional preparing for a video conversation at a laptop" loading="lazy" />
          <div className="homev3-photo-chip top"><span>Before</span><strong>Know why you are meeting</strong></div>
          <div className="homev3-photo-chip bottom"><span>After send</span><strong>Know what needs attention</strong></div>
        </div>
        <div className="homev3-people-copy">
          <p className="homev2-kicker">People, not calendar slots</p>
          <h2>Scheduling is software. The meeting is a human moment.</h2>
          <p>CallSync should never feel like a wall of forms between two people. The software stays in the background—protecting your time, carrying context, and making the next step obvious.</p>
          <div className="homev3-human-points">
            <div><span>01</span><strong>Less coordination</strong><p>Offer intentional windows instead of negotiating time over messages.</p></div>
            <div><span>02</span><strong>More context</strong><p>Keep the reason for the call attached to the request from the start.</p></div>
            <div><span>03</span><strong>Clear next action</strong><p>See when a meeting is booked, waiting, or needs a personal follow-up.</p></div>
          </div>
        </div>
      </section>

      <section className="homev2-workspace-story homev3-workspace-story" data-reveal>
        <div className="homev2-story-copy">
          <p className="homev2-kicker">Built around next actions</p>
          <h2>Your dashboard should tell you what needs attention.</h2>
          <p>
            CallSync treats every meeting request like a small pipeline. Fresh invites can wait. Older unanswered links surface as follow-up risk. Confirmed calls move forward. Closed requests get out of the way.
          </p>
          <a href={hasToken ? '/dashboard' : '/login'}>Open the meeting pipeline <span aria-hidden="true">→</span></a>
        </div>

        <div className="homev2-event-log homev3-event-log" aria-label="Example CallSync activity log">
          <div className="homev2-event-log-header">
            <span>Investor intro · Maya Chen</span>
            <span><i className="homev3-live-dot" /> Live workflow</span>
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

      <section className="homev2-use-cases homev3-use-cases" id="use-cases" data-reveal>
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
              <i aria-hidden="true">↗</i>
            </article>
          ))}
        </div>
      </section>

      <section className="homev3-trust-block" data-reveal>
        <div>
          <p className="homev2-kicker">Trust comes from clarity</p>
          <h2>No invented logos. No fake customer counts. Just a product you can understand.</h2>
        </div>
        <div className="homev3-trust-grid">
          <article><span>Calendar connections</span><strong>Google + Outlook</strong><p>Availability can be checked against calendars you already use.</p></article>
          <article><span>Host control</span><strong>Curated slots</strong><p>You decide the duration, buffers, working windows, and options guests see.</p></article>
          <article><span>Meeting visibility</span><strong>Pipeline states</strong><p>Waiting, booked, closed, and follow-up risk stay visible after the link is sent.</p></article>
        </div>
      </section>

      <section className="homev2-final-cta homev3-final-cta" data-reveal>
        <div>
          <p className="homev2-kicker">CallSync</p>
          <h2>Stop treating the meeting link as the finish line.</h2>
        </div>
        <div>
          <p>Turn interested replies into booked, visible, and better-prepared meetings.</p>
          <a href={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Go to your dashboard' : 'Create your first request'} <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <footer className="homev2-footer homev3-footer">
        <Logo />
        <p>Meeting CRM for high-value calls.</p>
        <a href="/login">Sign in</a>
      </footer>
    </main>
  );
}

export default LandingPageV3;
