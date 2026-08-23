import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MEETING_TEMPLATES, buildMeetingDraftFromPrompt } from './App';
import { getFollowUpRisk, getMeetingPipelineStages, needsFollowUp } from './followUpWorkflow';
import CalendarConnectionStatus from './CalendarConnectionStatus';
import './ProductWorkspace.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(value) {
  if (!value) return 'Waiting for guest';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waiting for guest';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Brand() {
  return <a className="pw-brand" href="/"><span>CS</span><strong>CallSync</strong></a>;
}

function beginOAuth(provider) {
  const isGoogle = provider === 'google';
  const clientId = process.env[isGoogle ? 'REACT_APP_GOOGLE_CLIENT_ID' : 'REACT_APP_OUTLOOK_CLIENT_ID'];
  if (!clientId) return false;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/${provider}`,
    response_type: 'code',
    scope: isGoogle
      ? 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'
      : 'Calendars.ReadWrite Mail.Send offline_access',
    ...(isGoogle
      ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }
      : { prompt: 'consent' }),
  });

  window.location.href = isGoogle
    ? `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  return true;
}

function PipelineView({ onCreate }) {
  const [meetings, setMeetings] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, followUpResponse, analyticsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }).catch(() => ({ data: { followUps: [] } })),
        axios.get(`${API_URL}/api/analytics/meeting-lifecycle`, { headers: authHeaders() }).catch(() => ({ data: null })),
      ]);

      const followUpById = new Map((followUpResponse.data.followUps || []).map((item) => [item.meetingId, item]));
      const nextMeetings = (meetingsResponse.data.meetings || []).map((meeting) => ({
        ...meeting,
        ...(followUpById.get(meeting.id) || {
          followUpCount: 0,
          lastFollowedUpAt: null,
          nextFollowUpAt: null,
          lastFollowUpProvider: null,
        }),
      }));
      setMeetings(nextMeetings);
      setAnalytics(analyticsResponse.data?.allTime || null);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load the meeting pipeline.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visibleMeetings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return meetings;
    return meetings.filter((meeting) => [
      meeting.attendeeName,
      meeting.attendeeEmail,
      meeting.meetingType,
      meeting.meetingGoal,
    ].some((value) => String(value || '').toLowerCase().includes(normalized)));
  }, [meetings, query]);

  const pipeline = useMemo(() => getMeetingPipelineStages(visibleMeetings), [visibleMeetings]);
  const booked = meetings.filter((meeting) => meeting.status === 'confirmed').length;
  const followUpDue = meetings.filter(needsFollowUp).length;
  const bookingRate = analytics?.rates?.booking ?? (meetings.length ? Math.round((booked / meetings.length) * 100) : 0);

  return (
    <section className="pw-page pw-pipeline-page">
      <header className="pw-page-head">
        <div>
          <p className="pw-kicker">Meeting pipeline</p>
          <h1>Every conversation, one clear next state.</h1>
          <p>Use the board to scan progress. Open a meeting when you need the full record.</p>
        </div>
        <button className="pw-primary-button" type="button" onClick={onCreate}>+ New meeting</button>
      </header>

      <div className="pw-metrics" aria-label="Pipeline summary">
        <article><span>Total requests</span><strong>{meetings.length}</strong><small>All meeting records</small></article>
        <article><span>Booked</span><strong>{booked}</strong><small>{bookingRate}% booking rate</small></article>
        <article><span>Needs attention</span><strong>{followUpDue}</strong><small>Follow-up or delivery issue</small></article>
        <article><span>Outcome capture</span><strong>{analytics?.rates?.outcomeCapture ?? 0}%</strong><small>{analytics?.outcomesRecorded ?? 0} recorded</small></article>
      </div>

      <div className="pw-board-toolbar">
        <label className="pw-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attendee, email or meeting type" />
        </label>
        <button className="pw-secondary-button" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && <div className="pw-message error">{message}</div>}
      {loading && !meetings.length && <div className="pw-loading-card">Loading your pipeline…</div>}

      {!loading && !meetings.length ? (
        <div className="pw-empty-state">
          <span>01</span>
          <h2>Your meeting pipeline is empty.</h2>
          <p>Create a focused meeting request. Once it is sent, CallSync will track it from invite to outcome.</p>
          <button className="pw-primary-button" type="button" onClick={onCreate}>Create first meeting</button>
        </div>
      ) : (
        <div className="pw-kanban" aria-label="Meeting pipeline board">
          {pipeline.map((stage) => (
            <section className={`pw-kanban-column stage-${stage.id}`} key={stage.id}>
              <header className="pw-kanban-column-head">
                <div><i aria-hidden="true" /><span>{stage.label}</span></div>
                <b>{stage.meetings.length}</b>
              </header>
              <div className="pw-kanban-cards">
                {stage.meetings.map((meeting) => {
                  const risk = getFollowUpRisk(meeting);
                  return (
                    <a className="pw-meeting-card" href={`/meeting/${meeting.id}`} key={meeting.id}>
                      <div className="pw-meeting-card-top">
                        <span className="pw-type-chip">{meeting.meetingType || 'General meeting'}</span>
                        <span className={`pw-status-dot status-${meeting.status}`} aria-label={meeting.status} />
                      </div>
                      <h3>{meeting.attendeeName || 'Unnamed guest'}</h3>
                      <p className="pw-card-email">{meeting.attendeeEmail}</p>
                      <div className="pw-card-meta">
                        <span>{meeting.status === 'confirmed' ? 'Meeting time' : meeting.status === 'cancelled' ? 'Closed' : 'Created'}</span>
                        <strong>{meeting.status === 'confirmed' ? formatShortDate(meeting.selectedSlot) : formatShortDate(meeting.createdAt)}</strong>
                      </div>
                      {risk.level !== 'none' && (
                        <div className={`pw-risk risk-${risk.level}`}><span>{risk.label}</span><small>{risk.detail}</small></div>
                      )}
                      {meeting.status === 'confirmed' && meeting.durationMinutes && <div className="pw-card-foot"><span>{meeting.durationMinutes} min</span><span>Open record →</span></div>}
                      {meeting.status !== 'confirmed' && <div className="pw-card-foot"><span>{meeting.slotCount || 0} offered slot{meeting.slotCount === 1 ? '' : 's'}</span><span>Open record →</span></div>}
                    </a>
                  );
                })}
                {!stage.meetings.length && <div className="pw-column-empty">Nothing here right now.</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function CreateMeetingView({ onDone }) {
  const [form, setForm] = useState({
    attendeeEmail: '', attendeeName: '', selectedDate: '', durationMinutes: 60,
    bufferMinutes: 0, slotIntervalMinutes: 30, workStartHour: 9, workEndHour: 17,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [brief, setBrief] = useState({
    type: 'General meeting',
    goal: 'Create a focused meeting request and keep the invite visible until it is booked.',
    questions: ['What should we cover?', 'Is there anything I should review first?'],
    message: 'Here are a few times that work on my side. Pick the one that is best for you.',
  });
  const [internalNotes, setInternalNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [createdLink, setCreatedLink] = useState('');

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setBriefField = (key, value) => setBrief((current) => ({ ...current, [key]: value }));

  function setQuestion(index, value) {
    setBrief((current) => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? value : item) }));
  }

  function applyDraft(draft) {
    setForm((current) => ({ ...current, ...Object.fromEntries(Object.entries(draft.formPatch || {}).filter(([, value]) => value !== '')) }));
    setBrief(draft.brief);
  }

  async function generateBrief() {
    if (!prompt.trim()) {
      setMessage('Describe the meeting or choose a template first.');
      return;
    }
    const fallback = buildMeetingDraftFromPrompt(prompt);
    setBusy('brief');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'meeting_brief', context: { prompt: prompt.trim() },
      }, { headers: authHeaders() });
      applyDraft(response.data.output || fallback);
    } catch {
      applyDraft(fallback);
      setMessage('CallSync used the built-in meeting workflow because assisted generation was unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function fetchSlots() {
    if (!form.selectedDate) {
      setMessage('Choose a meeting date first.');
      return;
    }
    setBusy('slots');
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, {
        params: { date: form.selectedDate, ...form }, headers: authHeaders(),
      });
      setSlots(response.data.availableSlots || []);
      setSelected([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load available slots.');
    } finally {
      setBusy('');
    }
  }

  function toggleSlot(slot) {
    setSelected((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  }

  async function createMeeting() {
    if (!form.attendeeEmail || !form.attendeeName || !selected.length) {
      setMessage('Add the guest and select at least one slot.');
      return;
    }
    setBusy('create');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/meetings/create`, {
        attendeeEmail: form.attendeeEmail,
        attendeeName: form.attendeeName,
        slots: selected,
        durationMinutes: form.durationMinutes,
        brief: { ...brief, internalNotes },
      }, { headers: authHeaders() });
      const link = `${window.location.origin}/select-slot/${response.data.uniqueLink}`;
      setCreatedLink(link);
      setMessage(response.data.delivery?.requestEmail?.sent
        ? 'Meeting request created and sent successfully.'
        : 'Meeting created, but email delivery was not confirmed. Copy the booking link and send it manually.');
      setSlots([]);
      setSelected([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not create the meeting request.');
    } finally {
      setBusy('');
    }
  }

  async function copyCreatedLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setMessage('Booking link copied.');
    } catch {
      setMessage(createdLink);
    }
  }

  return (
    <section className="pw-page pw-create-page">
      <header className="pw-page-head compact">
        <div><p className="pw-kicker">New meeting</p><h1>Create the request around the conversation.</h1><p>Start with intent, then choose only the slots you actually want to offer.</p></div>
      </header>

      <div className="pw-create-layout">
        <section className="pw-form-card">
          <div className="pw-section-title"><span>1</span><div><h2>Meeting intent</h2><p>Use AI or a proven template, then edit everything.</p></div></div>
          <textarea className="pw-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: 30 minute investor intro next Tuesday afternoon. Ask what fund they are with and what they want to discuss." />
          <div className="pw-template-row">
            {Object.entries(MEETING_TEMPLATES).map(([key, template]) => (
              <button key={key} type="button" onClick={() => applyDraft(buildMeetingDraftFromPrompt(template.label))}>
                <strong>{template.label}</strong><span>{template.durationMinutes} min</span>
              </button>
            ))}
          </div>
          <button className="pw-secondary-button" type="button" onClick={generateBrief} disabled={busy === 'brief'}>{busy === 'brief' ? 'Generating…' : 'Generate brief'}</button>
        </section>

        <section className="pw-form-card">
          <div className="pw-section-title"><span>2</span><div><h2>Guest & availability</h2><p>CallSync checks both connected calendars before showing slots.</p></div></div>
          <div className="pw-form-grid two">
            <label><span>Guest name</span><input value={form.attendeeName} onChange={(event) => set('attendeeName', event.target.value)} placeholder="Maya Chen" /></label>
            <label><span>Guest email</span><input type="email" value={form.attendeeEmail} onChange={(event) => set('attendeeEmail', event.target.value)} placeholder="maya@company.com" /></label>
            <label><span>Meeting date</span><input type="date" value={form.selectedDate} onChange={(event) => set('selectedDate', event.target.value)} /></label>
            <label><span>Duration</span><select value={form.durationMinutes} onChange={(event) => set('durationMinutes', Number(event.target.value))}>{[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label>
          </div>
          <details className="pw-advanced-settings">
            <summary>Availability settings</summary>
            <div className="pw-form-grid three">
              <label><span>Buffer</span><select value={form.bufferMinutes} onChange={(event) => set('bufferMinutes', Number(event.target.value))}>{[0, 5, 10, 15, 30].map((value) => <option key={value} value={value}>{value ? `${value} min` : 'None'}</option>)}</select></label>
              <label><span>Interval</span><select value={form.slotIntervalMinutes} onChange={(event) => set('slotIntervalMinutes', Number(event.target.value))}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
              <label><span>Timezone</span><input value={form.timeZone} onChange={(event) => set('timeZone', event.target.value)} /></label>
              <label><span>Workday starts</span><input type="number" min="0" max="23" value={form.workStartHour} onChange={(event) => set('workStartHour', Number(event.target.value))} /></label>
              <label><span>Workday ends</span><input type="number" min="1" max="24" value={form.workEndHour} onChange={(event) => set('workEndHour', Number(event.target.value))} /></label>
            </div>
          </details>
          <button className="pw-primary-button" type="button" onClick={fetchSlots} disabled={busy === 'slots'}>{busy === 'slots' ? 'Checking calendars…' : 'Find available slots'}</button>
        </section>

        <section className="pw-form-card pw-brief-editor">
          <div className="pw-section-title"><span>3</span><div><h2>Meeting brief</h2><p>This context travels with the meeting record.</p></div></div>
          <label><span>Meeting type</span><input value={brief.type} onChange={(event) => setBriefField('type', event.target.value)} /></label>
          <label><span>Goal</span><textarea value={brief.goal} onChange={(event) => setBriefField('goal', event.target.value)} /></label>
          <label><span>Invite message</span><textarea value={brief.message} onChange={(event) => setBriefField('message', event.target.value)} /></label>
          <div className="pw-question-editor">
            <span>Guest questions</span>
            {brief.questions.map((question, index) => <input key={`question-${index}`} value={question} onChange={(event) => setQuestion(index, event.target.value)} />)}
          </div>
          <label><span>Private host notes</span><textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Only you will see these notes." /></label>
        </section>

        <aside className="pw-slot-card">
          <div><p className="pw-kicker">Offer these times</p><h2>{selected.length} selected</h2><p>Only selected slots become temporary holds when you create the request.</p></div>
          {slots.length ? (
            <div className="pw-slot-grid">{slots.map((slot) => <button type="button" className={selected.includes(slot) ? 'selected' : ''} key={slot} onClick={() => toggleSlot(slot)}>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div>
          ) : <div className="pw-slot-empty">Choose a date and check availability to see bookable times.</div>}
          {!!slots.length && <button className="pw-primary-button wide" type="button" onClick={createMeeting} disabled={!selected.length || busy === 'create'}>{busy === 'create' ? 'Creating…' : `Create request · ${selected.length} slot${selected.length === 1 ? '' : 's'}`}</button>}
        </aside>
      </div>

      {message && <div className={`pw-message ${createdLink ? 'success' : ''}`}>{message}{createdLink && <div className="pw-created-actions"><button type="button" onClick={copyCreatedLink}>Copy booking link</button><button type="button" onClick={onDone}>View pipeline</button></div>}</div>}
    </section>
  );
}

function CalendarsView() {
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

export default function ProductWorkspace() {
  const [tab, setTab] = useState('pipeline');

  useEffect(() => {
    if (!localStorage.getItem('token')) window.location.replace('/login');
  }, []);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    window.location.assign('/');
  }

  const navigation = [
    ['pipeline', 'Pipeline', '▦'],
    ['create', 'New meeting', '+'],
    ['calendars', 'Calendars', '◫'],
  ];

  return (
    <main className="pw-shell">
      <aside className="pw-sidebar">
        <div>
          <Brand />
          <nav className="pw-nav" aria-label="Workspace navigation">
            {navigation.map(([id, label, icon]) => (
              <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>
            ))}
          </nav>
        </div>
        <div className="pw-sidebar-foot">
          <div className="pw-sidebar-note"><span>Workspace</span><strong>Meeting OS</strong><small>Create → book → prepare → remember</small></div>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="pw-main">
        {tab === 'pipeline' && <PipelineView onCreate={() => setTab('create')} />}
        {tab === 'create' && <CreateMeetingView onDone={() => setTab('pipeline')} />}
        {tab === 'calendars' && <CalendarsView />}
      </section>
    </main>
  );
}
