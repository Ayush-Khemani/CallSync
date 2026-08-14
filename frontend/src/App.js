import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Brand() {
  return <span className="brand"><span>CS</span><strong>CallSync</strong></span>;
}

function formatDateTime(value) {
  if (!value) return 'Not selected';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function daysSince(value) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

export function getFollowUpRisk(meeting) {
  if (meeting.status !== 'pending') {
    return { level: 'none', label: 'No follow-up needed', detail: 'This meeting is no longer waiting on a guest.' };
  }

  const age = daysSince(meeting.createdAt);
  if (age >= 5) {
    return { level: 'high', label: 'High follow-up risk', detail: `${age} days waiting. Send a personal nudge today.` };
  }
  if (age >= 2) {
    return { level: 'medium', label: 'Follow-up due', detail: `${age} days waiting. Keep this invite from going cold.` };
  }
  return {
    level: 'low',
    label: 'Healthy invite',
    detail: age === 0 ? 'Sent today. Give the guest room to choose.' : `${age} day waiting. No action needed yet.`,
  };
}

function needsFollowUp(meeting) {
  return ['medium', 'high'].includes(getFollowUpRisk(meeting).level);
}

export function getMeetingPipelineStages(meetings) {
  return [
    { id: 'followUp', label: 'Needs follow-up', meetings: meetings.filter(needsFollowUp) },
    { id: 'pending', label: 'Link sent', meetings: meetings.filter((meeting) => meeting.status === 'pending' && !needsFollowUp(meeting)) },
    { id: 'confirmed', label: 'Booked', meetings: meetings.filter((meeting) => meeting.status === 'confirmed') },
    { id: 'cancelled', label: 'Closed', meetings: meetings.filter((meeting) => meeting.status === 'cancelled') },
  ];
}

export function getMeetingActionState(meeting) {
  const isCancelled = meeting.status === 'cancelled';
  return {
    canCancel: !isCancelled,
    openLabel: isCancelled ? 'View closed link' : 'Open booking page',
    copyLabel: 'Copy booking link',
    cancelLabel: isCancelled ? 'Cancelled' : 'Cancel invite',
  };
}

export function getPipelineEmptyState(stageId) {
  const states = {
    followUp: {
      title: 'No follow-ups due',
      detail: 'Pending links will move here when they need a nudge, so you can act before the conversation goes cold.',
    },
    pending: {
      title: 'No links waiting',
      detail: 'Freshly sent booking links appear here while the guest is still choosing a time.',
    },
    confirmed: {
      title: 'No booked meetings',
      detail: 'Confirmed meetings land here after a guest selects one of your approved slots.',
    },
    cancelled: {
      title: 'No closed requests',
      detail: 'Cancelled or closed-out invites collect here so your active pipeline stays clean.',
    },
    all: {
      title: 'Your meeting pipeline is empty',
      detail: 'Create a meeting request, choose the slots you want to offer, then share one booking link. CallSync will track what happens next.',
    },
  };

  return states[stageId] || states.all;
}

export const MEETING_TEMPLATES = {
  founder: {
    label: 'Founder sales',
    type: 'Customer discovery',
    goal: 'Qualify a founder or operator, understand the pain, and agree on the next step.',
    durationMinutes: 30,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 10,
    workEndHour: 17,
    questions: ['What problem are you trying to solve?', 'What tools are you using today?', 'What would make this call successful?'],
    message: 'Thanks for the reply. Pick any of the times here and I will come prepared with a focused agenda.',
  },
  investor: {
    label: 'Investor intro',
    type: 'Investor meeting',
    goal: 'Prepare a concise fundraising or advisor conversation with context before the call.',
    durationMinutes: 30,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 13,
    workEndHour: 18,
    questions: ['What fund or company are you with?', 'What stage do you usually invest in?', 'Any topic you want me to cover first?'],
    message: 'Great to connect. Here are a few focused windows for an intro call.',
  },
  recruiting: {
    label: 'Recruiting screen',
    type: 'Candidate screen',
    goal: 'Run an efficient candidate conversation with role fit and availability known up front.',
    durationMinutes: 45,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 9,
    workEndHour: 16,
    questions: ['Which role are you most interested in?', 'What is your earliest start date?', 'Share one project you would like to discuss.'],
    message: 'Choose a time that works for you. I will review your background before we speak.',
  },
  client: {
    label: 'Client onboarding',
    type: 'Client kickoff',
    goal: 'Align scope, urgency, decision process, and immediate next steps.',
    durationMinutes: 60,
    bufferMinutes: 15,
    slotIntervalMinutes: 30,
    workStartHour: 10,
    workEndHour: 16,
    questions: ['What outcome do you want from this project?', 'Who needs to be involved?', 'Is there a target deadline?'],
    message: 'Use this link to pick a kickoff time. I will use your answers to structure the session.',
  },
};

export function inferMeetingTemplate(text) {
  const prompt = text.toLowerCase();
  if (prompt.includes('investor') || prompt.includes('fundraising') || prompt.includes('vc')) return 'investor';
  if (prompt.includes('candidate') || prompt.includes('interview') || prompt.includes('recruit')) return 'recruiting';
  if (prompt.includes('client') || prompt.includes('kickoff') || prompt.includes('onboarding')) return 'client';
  return 'founder';
}

export function inferDuration(text, fallback) {
  const match = text.match(/(\d{2,3})\s*(minute|min|mins)/i);
  if (!match) return fallback;
  const value = Number(match[1]);
  return [15, 30, 45, 60].includes(value) ? value : fallback;
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferSelectedDate(text, now = new Date()) {
  const prompt = text.toLowerCase();
  const date = new Date(now);
  if (prompt.includes('tomorrow')) {
    date.setDate(date.getDate() + 1);
    return formatInputDate(date);
  }
  if (prompt.includes('next week')) {
    date.setDate(date.getDate() + 7);
    return formatInputDate(date);
  }
  return '';
}

function inferWorkWindow(text, fallback) {
  const prompt = text.toLowerCase();
  if (prompt.includes('morning')) return { workStartHour: 9, workEndHour: 12, label: 'Morning window' };
  if (prompt.includes('afternoon')) return { workStartHour: 13, workEndHour: 17, label: 'Afternoon window' };
  if (prompt.includes('evening')) return { workStartHour: 17, workEndHour: 20, label: 'Evening window' };
  return { workStartHour: fallback.workStartHour, workEndHour: fallback.workEndHour, label: 'Template working window' };
}

function inferGuest(text) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const nameMatch = text.match(/\b(?:with|for|to)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})\b/);
  return {
    attendeeEmail: email,
    attendeeName: nameMatch ? nameMatch[1].trim() : '',
  };
}

function inferQuestions(text, templateQuestions) {
  const prompt = text.toLowerCase();
  const questions = [...templateQuestions];

  if (prompt.includes('budget') && !questions.some((question) => question.toLowerCase().includes('budget'))) {
    questions.push('What budget range should we keep in mind?');
  }
  if ((prompt.includes('timeline') || prompt.includes('deadline')) && !questions.some((question) => question.toLowerCase().includes('deadline'))) {
    questions.push('What timeline or deadline matters most?');
  }
  if (prompt.includes('decision') && !questions.some((question) => question.toLowerCase().includes('decision'))) {
    questions.push('Who is involved in the decision?');
  }

  return questions.slice(0, 5);
}

export function buildMeetingDraftFromPrompt(text, options = {}) {
  const prompt = text.trim();
  const templateKey = inferMeetingTemplate(prompt);
  const template = MEETING_TEMPLATES[templateKey];
  const window = inferWorkWindow(prompt, template);
  const guest = inferGuest(prompt);
  const durationMinutes = inferDuration(prompt, template.durationMinutes);
  const selectedDate = inferSelectedDate(prompt, options.now);

  return {
    templateKey,
    formPatch: {
      ...guest,
      ...(selectedDate ? { selectedDate } : {}),
      durationMinutes,
      bufferMinutes: template.bufferMinutes,
      slotIntervalMinutes: template.slotIntervalMinutes,
      workStartHour: window.workStartHour,
      workEndHour: window.workEndHour,
    },
    brief: {
      type: template.type,
      goal: template.goal,
      questions: inferQuestions(prompt, template.questions),
      message: template.message,
    },
    insights: [
      `${template.label} intent`,
      `${durationMinutes} minute call`,
      `${template.bufferMinutes} minute buffer`,
      window.label,
      selectedDate ? `Date set to ${selectedDate}` : 'Host chooses date',
    ],
  };
}

function LandingPage() {
  const hasToken = Boolean(localStorage.getItem('token'));
  return (
    <main className="landing">
      <nav className="topbar">
        <Brand />
        <div>
          <a href="#product">Product</a>
          <a href="#use-cases">Use cases</a>
          <a href="#workflow">Workflow</a>
          <Link to="/login">Sign in</Link>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-desk" aria-hidden="true">
          <div className="desk-board">
            <div className="desk-window host-window">
              <header><b>Host console</b><span>New request</span></header>
              <div className="request-stack">
                <p><span>Guest</span><b>Maya Chen</b></p>
                <p><span>Duration</span><b>45 min</b></p>
                <p><span>Buffer</span><b>15 min</b></p>
              </div>
              <div className="availability-strip">
                <i className="open" /><i /><i className="open wide" /><i /><i className="open" />
              </div>
            </div>
            <div className="desk-window booking-window">
              <header><b>Booking page</b><span>callsync.io/maya</span></header>
              <div className="week-row">{['Mon', 'Tue', 'Wed', 'Thu'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="time-grid">{['9:30', '11:00', '2:00', '4:30', '5:00', '5:30'].map((time, index) => <button className={index === 2 ? 'chosen' : ''} key={time}>{time}</button>)}</div>
            </div>
            <div className="desk-window ledger-window">
              <header><b>Meeting ledger</b><span>Live</span></header>
              {['Pending invite sent', 'Guest selected slot', 'Calendar hold created'].map((item, index) => <p key={item}><i>{index + 1}</i><span>{item}</span></p>)}
            </div>
          </div>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Scheduling links with an operator's edge</p>
          <h1>Send fewer links. Close the loop on every meeting.</h1>
          <p>CallSync gives hosts a clean way to design availability, send a focused booking link, and track what happened after the invite leaves their hands.</p>
          <div className="hero-actions">
            <Link className="btn primary" to={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open dashboard' : 'Create your first link'}</Link>
            <a className="btn light" href="#product">View product tour</a>
          </div>
        </div>
      </section>
      <section className="proof" aria-label="CallSync product pillars">
        <article><b>Availability rules</b><span>Duration, buffers, intervals, timezone, and work hours in one place.</span></article>
        <article><b>Guest-ready links</b><span>A booking experience that feels intentional, not like a form.</span></article>
        <article><b>Host visibility</b><span>Pending, confirmed, and cancelled requests stay easy to manage.</span></article>
      </section>

      <section className="product-tour" id="product">
        <div>
          <p className="eyebrow">Product tour</p>
          <h2>A scheduling workspace, not a link generator.</h2>
          <p>Most booking tools focus on the page your guest sees. CallSync starts one step earlier: with the host deciding exactly what should be offered, tracked, and confirmed.</p>
        </div>
        <div className="tour-grid">
          <article><span>01</span><h3>Shape the request</h3><p>Define the guest, date, time window, duration, buffer, and timezone before availability is generated.</p></article>
          <article><span>02</span><h3>Offer curated slots</h3><p>Share a set of times you actually want booked instead of exposing your entire calendar.</p></article>
          <article><span>03</span><h3>Manage the lifecycle</h3><p>Open, copy, cancel, and review status from a host dashboard that keeps work moving.</p></article>
        </div>
      </section>

      <section className="use-case-band" id="use-cases">
        <div className="section-kicker">
          <p className="eyebrow">Use cases</p>
          <h2>Built for people who cannot afford loose scheduling.</h2>
        </div>
        <div className="use-cases">
          <article><b>Founders</b><span>Investor calls, customer discovery, advisor meetings, candidate screens.</span></article>
          <article><b>Sales teams</b><span>Demos, qualification calls, handoffs, follow-ups with cleaner status tracking.</span></article>
          <article><b>Operators</b><span>Interviews, vendor meetings, internal reviews, and fast calendar coordination.</span></article>
        </div>
      </section>

      <section className="workflow-band" id="workflow">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>The meeting loop should be visible from start to finish.</h2>
        </div>
        <ol>
          <li><b>Create</b><span>Set the meeting brief and the availability constraints.</span></li>
          <li><b>Send</b><span>Share a single booking link that reflects only approved options.</span></li>
          <li><b>Confirm</b><span>Let the guest select once, then keep the host dashboard up to date.</span></li>
        </ol>
      </section>
    </main>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { email, password });
      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userId', response.data.userId);
        navigate('/dashboard');
      } else {
        setMessage('Account created. Sign in to open your workspace.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <Link to="/"><Brand /></Link>
        <div><p className="eyebrow">Welcome to CallSync</p><h1>{isLogin ? 'Sign in to your meeting pipeline.' : 'Create your CallSync workspace.'}</h1><p>Manage availability, booking links, follow-up risk, and meeting confirmations from one focused workspace.</p></div>
        <aside><span>Next best action</span><b>Review pending invite links</b><small>Pipeline ready after sign-in</small></aside>
      </section>
      <section className="panel auth-panel">
        <p className="eyebrow">{isLogin ? 'Existing workspace' : 'New workspace'}</p>
        <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
        <p>{isLogin ? 'Use your CallSync credentials to continue.' : 'Start with an email and secure password.'}</p>
        <form className="form" onSubmit={submit}>
          <label>Email<input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Working...' : isLogin ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link-button" onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Create a new account' : 'Back to sign in'}</button>
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

function Dashboard() {
  const [tab, setTab] = useState('meetings');
  const navigate = useNavigate();
  const tabs = [['meetings', 'Pipeline'], ['create', 'Create'], ['calendars', 'Calendars']];

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/');
  }

  function oauth(provider) {
    const isGoogle = provider === 'google';
    const params = new URLSearchParams({
      client_id: process.env[isGoogle ? 'REACT_APP_GOOGLE_CLIENT_ID' : 'REACT_APP_OUTLOOK_CLIENT_ID'],
      redirect_uri: `${window.location.origin}/auth/${provider}`,
      response_type: 'code',
      scope: isGoogle ? 'https://www.googleapis.com/auth/calendar' : 'Calendars.ReadWrite offline_access',
      ...(isGoogle ? { access_type: 'offline', prompt: 'consent' } : {}),
    });
    window.location.href = isGoogle
      ? `https://accounts.google.com/o/oauth2/v2/auth?${params}`
      : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <Brand />
        <nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <button className="logout" onClick={logout}>Sign out</button>
      </aside>
      <section className="main">
        <header className="main-head"><div><p className="eyebrow">Host workspace</p><h1>Manage your meeting pipeline from one desk.</h1></div><button className="btn primary" onClick={() => setTab('create')}>New request</button></header>
        {tab === 'meetings' && <Meetings onCreate={() => setTab('create')} />}
        {tab === 'create' && <CreateMeeting />}
        {tab === 'calendars' && <Calendars onGoogle={() => oauth('google')} onOutlook={() => oauth('outlook')} />}
      </section>
    </main>
  );
}

function Meetings({ onCreate }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expandedStage, setExpandedStage] = useState('followUp');
  const stats = useMemo(() => ({
    total: meetings.length,
    confirmed: meetings.filter((m) => m.status === 'confirmed').length,
    pending: meetings.filter((m) => m.status === 'pending').length,
    followUp: meetings.filter(needsFollowUp).length,
  }), [meetings]);
  const pipeline = useMemo(() => getMeetingPipelineStages(meetings), [meetings]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() });
      setMeetings(response.data.meetings || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error loading meetings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const url = (link) => `${window.location.origin}/select-slot/${link}`;
  async function copy(link) {
    try {
      await navigator.clipboard.writeText(url(link));
      setMessage('Meeting link copied.');
    } catch {
      setMessage(url(link));
    }
  }
  async function cancel(link) {
    try {
      await axios.post(`${API_URL}/api/meetings/cancel/${link}`, {}, { headers: authHeaders() });
      setMessage('Meeting cancelled.');
      load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error cancelling meeting');
    }
  }

  function MeetingActions({ meeting, compact = false }) {
    const actions = getMeetingActionState(meeting);
    const actionLabel = meeting.attendeeName ? `Actions for ${meeting.attendeeName}` : 'Meeting actions';

    return (
      <aside className={compact ? 'meeting-actions compact-actions' : 'meeting-actions'} aria-label={actionLabel}>
        {!compact && <span>Actions</span>}
        <a className="btn primary small" href={url(meeting.uniqueLink)} target="_blank" rel="noreferrer" aria-label={`${actions.openLabel} for ${meeting.attendeeName}`} title={actions.openLabel}>{compact ? 'Open' : actions.openLabel}</a>
        <button className="btn light small" onClick={() => copy(meeting.uniqueLink)} aria-label={`${actions.copyLabel} for ${meeting.attendeeName}`} title={actions.copyLabel}>{compact ? 'Copy' : actions.copyLabel}</button>
        {!compact && <button className="btn danger small" disabled={!actions.canCancel} onClick={() => cancel(meeting.uniqueLink)} aria-label={`${actions.cancelLabel} for ${meeting.attendeeName}`} title={actions.cancelLabel}>{actions.cancelLabel}</button>}
      </aside>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Meeting pipeline</h2><p>Track every invite from link sent to booked, follow-up, or closed.</p></div><button className="btn light" onClick={load}>Refresh</button></div>
      <div className="stats">{Object.entries(stats).map(([label, value]) => <article key={label}><span>{label.replace(/([A-Z])/g, ' $1')}</span><b>{value}</b></article>)}</div>
      {!!meetings.length && (
        <div className="pipeline-board" aria-label="Meeting pipeline stages">
          {pipeline.map((stage) => (
            <article className={`pipeline-column ${stage.id}`} key={stage.id}>
              <header><span>{stage.label}</span><b>{stage.meetings.length}</b></header>
              {stage.meetings.slice(0, 3).map((meeting) => {
                const risk = getFollowUpRisk(meeting);
                return (
                  <div className="pipeline-card" key={meeting.id}>
                    <b>{meeting.attendeeName}</b>
                    <small>{meeting.attendeeEmail}</small>
                    <span>{meeting.status === 'confirmed' ? formatDateTime(meeting.selectedSlot) : `${daysSince(meeting.createdAt)} days since created`}</span>
                    {risk.level !== 'none' && <em className={`risk-chip ${risk.level}`}>{risk.label}</em>}
                    <MeetingActions meeting={meeting} compact />
                  </div>
                );
              })}
              {!stage.meetings.length && <p>{getPipelineEmptyState(stage.id).detail}</p>}
            </article>
          ))}
        </div>
      )}
      {loading && <div className="empty">Loading meetings...</div>}
      {!loading && !meetings.length && (
        <div className="empty empty-onboarding">
          <p className="eyebrow">Nothing to manage yet</p>
          <h3>{getPipelineEmptyState('all').title}</h3>
          <p>{getPipelineEmptyState('all').detail}</p>
          <button className="btn primary" type="button" onClick={onCreate}>Create first request</button>
        </div>
      )}
      {!!meetings.length && (
        <div className="grouped-meetings">
          {pipeline.map((stage) => (
            <section className="stage-group" key={stage.id}>
              <button className="stage-toggle" type="button" onClick={() => setExpandedStage(expandedStage === stage.id ? '' : stage.id)}>
                <span>{stage.label}</span>
                <b>{stage.meetings.length}</b>
              </button>
              {expandedStage === stage.id && (
                <div className="meeting-list">
                  {stage.meetings.map((meeting) => {
                    const risk = getFollowUpRisk(meeting);
                    return (
                      <article className="meeting" key={meeting.id}>
                        <div><header><h3>{meeting.attendeeName}</h3><span className={`badge ${needsFollowUp(meeting) ? 'followup' : meeting.status}`}>{needsFollowUp(meeting) ? 'needs follow-up' : meeting.status}</span></header><p>{meeting.attendeeEmail}</p>
                          <div className="meta"><span>Selected <b>{formatDateTime(meeting.selectedSlot)}</b></span><span>Window <b>{formatDateTime(meeting.firstSlot)} - {formatDateTime(meeting.lastSlot)}</b></span><span>Slots <b>{meeting.slotCount}</b></span></div>
                          {risk.level !== 'none' && <div className={`followup-risk ${risk.level}`}><b>{risk.label}</b><span>{risk.detail}</span></div>}
                        </div>
                        <MeetingActions meeting={meeting} />
                      </article>
                    );
                  })}
                  {!stage.meetings.length && (
                    <div className="empty compact stage-empty">
                      <h4>{getPipelineEmptyState(stage.id).title}</h4>
                      <p>{getPipelineEmptyState(stage.id).detail}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function Calendars({ onGoogle, onOutlook }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Calendar Connections</h2><p>Connect calendar sources so generated slots reflect real availability.</p></div></div>
      <div className="integrations">
        <article className="google"><span>Google Calendar</span><h3>Sync Gmail and Workspace availability.</h3><p>Use your primary Google calendar as the source of truth for open slots.</p><button className="btn primary" onClick={onGoogle}>Connect Google</button></article>
        <article className="outlook"><span>Outlook Calendar</span><h3>Bring Microsoft 365 into the same flow.</h3><p>Coordinate with work calendars while keeping the host workflow unchanged.</p><button className="btn primary" onClick={onOutlook}>Connect Outlook</button></article>
      </div>
    </section>
  );
}

function CreateMeeting() {
  const [form, setForm] = useState({ attendeeEmail: '', attendeeName: '', selectedDate: '', durationMinutes: 60, bufferMinutes: 0, slotIntervalMinutes: 30, workStartHour: 9, workEndHour: 17, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [brief, setBrief] = useState({ type: 'General meeting', goal: 'Create a focused meeting request and keep the invite visible until it is booked.', questions: ['What should we cover?', 'Is there anything I should review first?'], message: 'Here are a few times that work on my side. Pick the one that is best for you.' });
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantDraft, setAssistantDraft] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function applyDraft(draft) {
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(draft.formPatch).filter(([, value]) => value !== '')),
    }));
    setBrief(draft.brief);
    setAssistantDraft(draft);
    setMessage('Meeting brief applied. Add the guest and date, then generate slots.');
  }

  function applyTemplate(key) {
    applyDraft(buildMeetingDraftFromPrompt(MEETING_TEMPLATES[key].label));
  }

  function runAssistant() {
    if (!assistantPrompt.trim()) {
      setMessage('Describe the meeting first, or choose a production template.');
      return;
    }
    applyDraft(buildMeetingDraftFromPrompt(assistantPrompt));
  }

  async function fetchSlots() {
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, { params: { date: form.selectedDate, ...form }, headers: authHeaders() });
      setSlots(response.data.availableSlots || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error fetching available slots');
    }
  }
  async function create() {
    if (!form.attendeeEmail || !form.attendeeName || selected.length === 0) {
      setMessage('Please fill all fields and select at least one slot.');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/meetings/create`, { attendeeEmail: form.attendeeEmail, attendeeName: form.attendeeName, slots: selected }, { headers: authHeaders() });
      setMessage('Meeting created and email sent to the attendee.');
      setForm({ ...form, attendeeEmail: '', attendeeName: '', selectedDate: '' });
      setSlots([]);
      setSelected([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating meeting');
    }
  }
  function toggle(slot) {
    setSelected((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Create meeting request</h2><p>Start with intent, then turn it into a booking link with only the right slots.</p></div></div>
      <div className="assistant-builder">
        <div>
          <p className="eyebrow">Meeting assistant</p>
          <h3>Describe the call once. CallSync shapes the request.</h3>
          <textarea value={assistantPrompt} onChange={(e) => setAssistantPrompt(e.target.value)} placeholder="Example: Create a 30 minute investor intro next week in the afternoon and ask what fund they are from." />
          <div className="template-row">
            {Object.entries(MEETING_TEMPLATES).map(([key, template]) => <button type="button" key={key} onClick={() => applyTemplate(key)}>{template.label}</button>)}
          </div>
          <button type="button" className="btn primary" onClick={runAssistant}>Generate meeting brief</button>
        </div>
        <aside>
          <span>{brief.type}</span>
          <h4>{brief.goal}</h4>
          {assistantDraft && <div className="brief-summary">{assistantDraft.insights.map((item) => <small key={item}>{item}</small>)}</div>}
          <ul>{brief.questions.map((question) => <li key={question}>{question}</li>)}</ul>
          <p>{brief.message}</p>
        </aside>
      </div>
      <div className="create-grid">
        <form className="form">
          <label>Attendee email<input type="email" placeholder="guest@company.com" value={form.attendeeEmail} onChange={(e) => set('attendeeEmail', e.target.value)} /></label>
          <label>Attendee name<input type="text" placeholder="Guest name" value={form.attendeeName} onChange={(e) => set('attendeeName', e.target.value)} /></label>
          <label>Meeting date<input type="date" value={form.selectedDate} onChange={(e) => set('selectedDate', e.target.value)} /></label>
          <div className="prefs">
            <label>Duration<select value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))}>{[15, 30, 45, 60].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
            <label>Buffer<select value={form.bufferMinutes} onChange={(e) => set('bufferMinutes', Number(e.target.value))}>{[0, 5, 10, 15, 30].map((v) => <option key={v} value={v}>{v ? `${v} min` : 'None'}</option>)}</select></label>
            <label>Interval<select value={form.slotIntervalMinutes} onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}>{[15, 30, 60].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
            <label>Start<input type="number" min="0" max="23" value={form.workStartHour} onChange={(e) => set('workStartHour', Number(e.target.value))} /></label>
            <label>End<input type="number" min="1" max="24" value={form.workEndHour} onChange={(e) => set('workEndHour', Number(e.target.value))} /></label>
            <label>Timezone<input value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)} /></label>
          </div>
          <button type="button" className="btn primary" onClick={fetchSlots}>Find available slots</button>
        </form>
        <aside className="slot-panel"><p className="eyebrow">Selected slots</p><h3>{selected.length} ready to share</h3><p>Choose the moments your guest can book from.</p>{slots.length ? <div className="slot-grid">{slots.map((slot) => <button className={selected.includes(slot) ? 'slot selected' : 'slot'} key={slot} onClick={() => toggle(slot)}>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div> : <div className="empty dark">Available slots will appear here.</div>} {!!slots.length && <button className="btn success" onClick={create}>Create request with {selected.length} slots</button>}</aside>
      </div>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function SelectSlotPage() {
  const [meeting, setMeeting] = useState(null);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const uniqueLink = window.location.pathname.split('/').pop();
  useEffect(() => {
    axios.get(`${API_URL}/api/meetings/${uniqueLink}`).then((response) => {
      setMeeting(response.data.meeting);
      setSlots(response.data.slots || []);
    }).catch(() => setMessage('Error loading meeting slots'));
  }, [uniqueLink]);
  async function choose(slot) {
    try {
      await axios.post(`${API_URL}/api/meetings/select-slot/${uniqueLink}`, { slotId: slot.id });
      setMessage('Slot selected. Confirmation email sent.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error selecting slot');
    }
  }
  return (
    <main className="booking-screen">
      <section className="panel booking"><Brand /><p className="eyebrow">Meeting invite</p><h1>Select your meeting time</h1><p>Choose the time that works best from the host-approved options.</p>{meeting?.status && <p className={`notice ${meeting.status}`}>Status: {meeting.status}{meeting.selectedSlot ? ` for ${formatDateTime(meeting.selectedSlot)}` : ''}</p>}{meeting?.status === 'cancelled' && <p>This meeting request is no longer available.</p>}<div className="slot-grid">{meeting?.status !== 'cancelled' && slots.map((slot) => <button className="slot" disabled={meeting?.status === 'confirmed'} key={slot.id} onClick={() => choose(slot)}>{new Date(slot.slot_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</button>)}</div>{message && <p className="message">{message}</p>}</section>
    </main>
  );
}

function CalendarCallback({ provider }) {
  const navigate = useNavigate();
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) axios.post(`${API_URL}/api/auth/${provider}-callback`, { code }, { headers: authHeaders() }).finally(() => navigate('/dashboard'));
  }, [navigate, provider]);
  return <main className="callback">Connecting {provider === 'google' ? 'Google' : 'Outlook'} Calendar...</main>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/select-slot/:uniqueLink" element={<SelectSlotPage />} />
        <Route path="/auth/google" element={<CalendarCallback provider="google" />} />
        <Route path="/auth/outlook" element={<CalendarCallback provider="outlook" />} />
      </Routes>
    </Router>
  );
}
