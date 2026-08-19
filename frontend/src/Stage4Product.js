import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  MEETING_TEMPLATES,
  buildMeetingDraftFromPrompt,
  getMeetingActionState,
  getPipelineEmptyState,
} from './App';
import {
  buildFollowUpMessage,
  getFollowUpMeta,
  getFollowUpRisk,
  getMeetingPipelineStages,
  needsFollowUp,
} from './followUpWorkflow';
import './Stage3Product.css';
import './Stage4FollowUp.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Brand() {
  return <a className="brand" href="/"><span>CS</span><strong>CallSync</strong></a>;
}

function formatDateTime(value) {
  if (!value) return 'Not selected';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function daysSince(value) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

function Dashboard() {
  const [tab, setTab] = useState('meetings');
  const tabs = [['meetings', 'Pipeline'], ['create', 'Create'], ['calendars', 'Calendars']];

  useEffect(() => {
    if (!localStorage.getItem('token')) window.location.replace('/login');
  }, []);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    window.location.assign('/');
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
    <main className="workspace stage3-workspace">
      <aside className="sidebar">
        <Brand />
        <nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <button className="logout" onClick={logout}>Sign out</button>
      </aside>
      <section className="main">
        <header className="main-head">
          <div><p className="eyebrow">Host workspace</p><h1>Manage your meeting pipeline from one desk.</h1></div>
          <button className="btn primary" onClick={() => setTab('create')}>New request</button>
        </header>
        {tab === 'meetings' && <Meetings onCreate={() => setTab('create')} />}
        {tab === 'create' && <CreateMeeting onCreated={() => setTab('meetings')} />}
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
  const [notesDrafts, setNotesDrafts] = useState({});
  const [followUpDrafts, setFollowUpDrafts] = useState({});
  const [savingNoteId, setSavingNoteId] = useState(null);
  const [recordingFollowUpId, setRecordingFollowUpId] = useState(null);
  const [generatingFollowUpId, setGeneratingFollowUpId] = useState(null);

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
      const [meetingsResponse, followUpResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }),
      ]);
      const followUpById = new Map((followUpResponse.data.followUps || []).map((item) => [item.meetingId, item]));
      const nextMeetings = (meetingsResponse.data.meetings || []).map((meeting) => ({
        ...meeting,
        ...(followUpById.get(meeting.id) || { followUpCount: 0, lastFollowedUpAt: null, nextFollowUpAt: null }),
      }));
      setMeetings(nextMeetings);
      setNotesDrafts(Object.fromEntries(nextMeetings.map((meeting) => [meeting.id, meeting.internalNotes || ''])));
      setFollowUpDrafts(Object.fromEntries(nextMeetings.filter((meeting) => meeting.status === 'pending').map((meeting) => [meeting.id, buildFollowUpMessage(meeting, `${window.location.origin}/select-slot/${meeting.uniqueLink}`)])));
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

  function followUpDraft(meeting) {
    return followUpDrafts[meeting.id] ?? buildFollowUpMessage(meeting, url(meeting.uniqueLink));
  }

  async function copyFollowUp(meeting) {
    const draft = followUpDraft(meeting);
    try {
      await navigator.clipboard.writeText(draft);
      setMessage('Follow-up message copied. Send it in the channel where the conversation already lives.');
    } catch {
      setMessage(draft);
    }
  }

  async function generateFollowUp(meeting) {
    const fallback = buildFollowUpMessage(meeting, url(meeting.uniqueLink));
    setGeneratingFollowUpId(meeting.id);
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'follow_up',
        meetingId: meeting.id,
        context: { bookingUrl: url(meeting.uniqueLink) },
      }, { headers: authHeaders() });
      setFollowUpDrafts((current) => ({ ...current, [meeting.id]: response.data.output?.message || fallback }));
      setMessage('Follow-up suggestion refreshed. Edit it before copying if you want.');
    } catch (error) {
      setFollowUpDrafts((current) => ({ ...current, [meeting.id]: fallback }));
      setMessage('Built-in follow-up suggestion restored because assisted generation was unavailable.');
    } finally {
      setGeneratingFollowUpId(null);
    }
  }

  async function markFollowedUp(meeting) {
    setRecordingFollowUpId(meeting.id);
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/follow-up`, {}, { headers: authHeaders() });
      const followUp = response.data.followUp;
      setMeetings((current) => current.map((item) => item.id === meeting.id ? { ...item, ...followUp } : item));
      setMessage('Follow-up recorded. CallSync will surface this request again when the next touch is due.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not record follow-up');
    } finally {
      setRecordingFollowUpId(null);
    }
  }

  async function cancel(link) {
    try {
      const response = await axios.post(`${API_URL}/api/meetings/cancel/${link}`, {}, { headers: authHeaders() });
      setMessage(response.data.delivery?.calendarCleanupComplete === false
        ? 'Meeting cancelled, but one or more calendar events could not be removed. Check your connected calendars.'
        : 'Meeting cancelled and calendar events removed.');
      load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error cancelling meeting');
    }
  }

  async function saveNotes(meeting) {
    setSavingNoteId(meeting.id);
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/notes`, {
        internalNotes: notesDrafts[meeting.id] || '',
      }, { headers: authHeaders() });
      setMeetings((current) => current.map((item) => item.id === meeting.id ? { ...item, internalNotes: response.data.internalNotes } : item));
      setMessage('Private notes saved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save notes');
    } finally {
      setSavingNoteId(null);
    }
  }

  function MeetingActions({ meeting, compact = false }) {
    const actions = getMeetingActionState(meeting);
    return (
      <aside className={compact ? 'meeting-actions compact-actions' : 'meeting-actions'}>
        {!compact && <span>Actions</span>}
        <a className="btn primary small" href={url(meeting.uniqueLink)} target="_blank" rel="noreferrer">{compact ? 'Open' : actions.openLabel}</a>
        <button className="btn light small" onClick={() => copy(meeting.uniqueLink)}>{compact ? 'Copy' : actions.copyLabel}</button>
        {compact && meeting.status === 'pending' && needsFollowUp(meeting) && <button className="btn light small" onClick={() => copyFollowUp(meeting)}>Copy nudge</button>}
        {!compact && <button className="btn danger small" disabled={!actions.canCancel} onClick={() => cancel(meeting.uniqueLink)}>{actions.cancelLabel}</button>}
      </aside>
    );
  }

  function FollowUpWorkflow({ meeting }) {
    if (meeting.status !== 'pending') return null;
    const risk = getFollowUpRisk(meeting);
    const meta = getFollowUpMeta(meeting);
    const draft = followUpDraft(meeting);

    return (
      <section className="followup-workflow-card">
        <div className="followup-workflow-head">
          <div>
            <small>Follow-up workflow</small>
            <strong>{risk.level === 'low' ? 'This request is being monitored.' : 'This request needs another touch.'}</strong>
          </div>
          <span className="followup-inline-state">{meta.count} follow-up{meta.count === 1 ? '' : 's'} recorded</span>
        </div>
        <div className="followup-workflow-meta">
          <span>Last follow-up: {meta.lastLabel}</span>
          <span>Next check: {meta.nextLabel}</span>
        </div>
        <label className="followup-copy-box editable-followup-copy">
          <span className="followup-copy-label">Suggested nudge · editable</span>
          <textarea value={draft} onChange={(event) => setFollowUpDrafts((current) => ({ ...current, [meeting.id]: event.target.value }))} />
        </label>
        <div className="followup-actions">
          <button className="btn light small" type="button" onClick={() => generateFollowUp(meeting)} disabled={generatingFollowUpId === meeting.id}>{generatingFollowUpId === meeting.id ? 'Refreshing…' : 'Refresh suggestion'}</button>
          <button className="btn light small" type="button" onClick={() => copyFollowUp(meeting)}>Copy follow-up</button>
          <button className="btn primary small" type="button" onClick={() => markFollowedUp(meeting)} disabled={recordingFollowUpId === meeting.id}>
            {recordingFollowUpId === meeting.id ? 'Recording…' : 'Mark followed up'}
          </button>
        </div>
      </section>
    );
  }

  function MeetingBrief({ meeting }) {
    const answers = Array.isArray(meeting.guestAnswers) ? meeting.guestAnswers : [];
    const questions = Array.isArray(meeting.qualificationQuestions) ? meeting.qualificationQuestions : [];
    const hasContext = meeting.meetingGoal || meeting.inviteMessage || questions.length || answers.length;

    return (
      <div className="meeting-context-grid">
        <section className="meeting-brief-card">
          <div className="context-label">Meeting brief</div>
          <div className="brief-type-row"><strong>{meeting.meetingType || 'General meeting'}</strong><span>{questions.length} guest question{questions.length === 1 ? '' : 's'}</span></div>
          {meeting.meetingGoal && <div><small>Goal</small><p>{meeting.meetingGoal}</p></div>}
          {meeting.inviteMessage && <div><small>Invite message</small><p>{meeting.inviteMessage}</p></div>}
          {!hasContext && <p className="muted-copy">This older request was created before persistent meeting briefs were enabled.</p>}
        </section>

        <section className="guest-answer-card">
          <div className="context-label">Guest context</div>
          {answers.length ? answers.map((item, index) => (
            <div className="answer-row" key={`${item.question}-${index}`}>
              <small>{item.question}</small>
              <p>{item.answer || 'No answer provided'}</p>
            </div>
          )) : <p className="muted-copy">Guest answers appear here after the meeting is booked.</p>}
        </section>

        <section className="internal-notes-card">
          <div className="context-label">Private host notes</div>
          <textarea
            value={notesDrafts[meeting.id] ?? ''}
            onChange={(event) => setNotesDrafts((current) => ({ ...current, [meeting.id]: event.target.value }))}
            placeholder="Add private preparation notes, context, or reminders for this meeting."
          />
          <button className="btn light small" onClick={() => saveNotes(meeting)} disabled={savingNoteId === meeting.id}>
            {savingNoteId === meeting.id ? 'Saving…' : 'Save notes'}
          </button>
        </section>
      </div>
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
                    <div className="pipeline-card-type">{meeting.meetingType || 'General meeting'}</div>
                    <b>{meeting.attendeeName}</b>
                    <small>{meeting.attendeeEmail}</small>
                    <span>{meeting.status === 'confirmed' ? formatDateTime(meeting.selectedSlot) : meeting.lastFollowedUpAt ? `Followed up ${formatDateTime(meeting.lastFollowedUpAt)}` : `${daysSince(meeting.createdAt)} days since created`}</span>
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
                <span>{stage.label}</span><b>{stage.meetings.length}</b>
              </button>
              {expandedStage === stage.id && (
                <div className="meeting-list">
                  {stage.meetings.map((meeting) => {
                    const risk = getFollowUpRisk(meeting);
                    return (
                      <article className="meeting stage3-meeting" key={meeting.id}>
                        <div className="meeting-core">
                          <header><div><div className="pipeline-card-type">{meeting.meetingType || 'General meeting'}</div><h3>{meeting.attendeeName}</h3></div><span className={`badge ${needsFollowUp(meeting) ? 'followup' : meeting.status}`}>{needsFollowUp(meeting) ? 'needs follow-up' : meeting.status}</span></header>
                          <p>{meeting.attendeeEmail}</p>
                          <div className="meta"><span>Selected <b>{formatDateTime(meeting.selectedSlot)}</b></span><span>Duration <b>{meeting.durationMinutes || 60} min</b></span><span>Window <b>{formatDateTime(meeting.firstSlot)} - {formatDateTime(meeting.lastSlot)}</b></span><span>Slots <b>{meeting.slotCount}</b></span></div>
                          {risk.level !== 'none' && <div className={`followup-risk ${risk.level}`}><b>{risk.label}</b><span>{risk.detail}</span></div>}
                          <FollowUpWorkflow meeting={meeting} />
                          <MeetingBrief meeting={meeting} />
                        </div>
                        <MeetingActions meeting={meeting} />
                      </article>
                    );
                  })}
                  {!stage.meetings.length && <div className="empty compact stage-empty"><h4>{getPipelineEmptyState(stage.id).title}</h4><p>{getPipelineEmptyState(stage.id).detail}</p></div>}
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
        <article className="google"><span>Google Calendar</span><h3>Sync Google availability.</h3><p>Use your primary Google calendar as the source of truth for open slots.</p><button className="btn primary" onClick={onGoogle}>Connect Google</button></article>
        <article className="outlook"><span>Outlook Calendar</span><h3>Bring Microsoft 365 into the same flow.</h3><p>Coordinate with work calendars while keeping the host workflow unchanged.</p><button className="btn primary" onClick={onOutlook}>Connect Outlook</button></article>
      </div>
    </section>
  );
}

function CreateMeeting({ onCreated }) {
  const [form, setForm] = useState({ attendeeEmail: '', attendeeName: '', selectedDate: '', durationMinutes: 60, bufferMinutes: 0, slotIntervalMinutes: 30, workStartHour: 9, workEndHour: 17, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [brief, setBrief] = useState({ type: 'General meeting', goal: 'Create a focused meeting request and keep the invite visible until it is booked.', questions: ['What should we cover?', 'Is there anything I should review first?'], message: 'Here are a few times that work on my side. Pick the one that is best for you.' });
  const [internalNotes, setInternalNotes] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantDraft, setAssistantDraft] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setBriefField = (key, value) => setBrief((current) => ({ ...current, [key]: value }));

  function setBriefQuestion(index, value) {
    setBrief((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => questionIndex === index ? value : question),
    }));
  }

  function applyDraft(draft) {
    setForm((current) => ({ ...current, ...Object.fromEntries(Object.entries(draft.formPatch).filter(([, value]) => value !== '')) }));
    setBrief(draft.brief);
    setAssistantDraft(draft);
    setMessage('Meeting brief applied. Add the guest and date, then generate slots.');
  }

  function applyTemplate(key) {
    applyDraft(buildMeetingDraftFromPrompt(MEETING_TEMPLATES[key].label));
  }

  async function runAssistant() {
    const prompt = assistantPrompt.trim();
    if (!prompt) {
      setMessage('Describe the meeting first, or choose a production template.');
      return;
    }

    const fallbackDraft = buildMeetingDraftFromPrompt(prompt);
    setAssistantLoading(true);
    setMessage('Shaping the meeting request…');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'meeting_brief',
        context: { prompt },
      }, { headers: authHeaders() });
      applyDraft(response.data.output || fallbackDraft);
      setMessage('Meeting brief ready. Review or edit it, then choose the date and slots.');
    } catch (error) {
      applyDraft(fallbackDraft);
      setMessage('Meeting brief ready. CallSync used its built-in meeting workflow because assisted generation was unavailable.');
    } finally {
      setAssistantLoading(false);
    }
  }

  async function fetchSlots() {
    setMessage('');
    if (!form.selectedDate) {
      setMessage('Choose a meeting date first.');
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, { params: { date: form.selectedDate, ...form }, headers: authHeaders() });
      setSlots(response.data.availableSlots || []);
      setSelected([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error fetching available slots');
    }
  }

  async function create() {
    if (!form.attendeeEmail || !form.attendeeName || selected.length === 0) {
      setMessage('Please fill the guest details and select at least one slot.');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/meetings/create`, {
        attendeeEmail: form.attendeeEmail,
        attendeeName: form.attendeeName,
        slots: selected,
        durationMinutes: form.durationMinutes,
        brief: { ...brief, internalNotes },
      }, { headers: authHeaders() });
      const bookingLink = `${window.location.origin}/select-slot/${response.data.uniqueLink}`;
      setMessage(response.data.delivery?.requestEmail?.sent
        ? `Meeting created and request email sent. Booking link: ${bookingLink}`
        : `Meeting created, but email delivery was not confirmed. Copy and send this booking link: ${bookingLink}`);
      setSlots([]);
      setSelected([]);
      if (onCreated) setTimeout(onCreated, 1200);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating meeting');
    }
  }

  function toggle(slot) {
    setSelected((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Create meeting request</h2><p>Start with intent, then turn it into a booking link that carries useful context with it.</p></div></div>
      <div className="assistant-builder">
        <div>
          <p className="eyebrow">Meeting assistant</p>
          <h3>Describe the call once. CallSync shapes the request.</h3>
          <textarea value={assistantPrompt} onChange={(e) => setAssistantPrompt(e.target.value)} placeholder="Example: Create a 30 minute investor intro next week in the afternoon and ask what fund they are from." />
          <div className="template-row" aria-label="Production meeting templates">
            {Object.entries(MEETING_TEMPLATES).map(([key, template]) => (
              <button type="button" key={key} onClick={() => applyTemplate(key)}><span>{template.label}</span><small>{template.summary}</small><em>{template.durationMinutes} min / {template.bufferMinutes} min buffer</em></button>
            ))}
          </div>
          <button type="button" className="btn primary" onClick={runAssistant} disabled={assistantLoading}>{assistantLoading ? 'Shaping request…' : 'Generate meeting brief'}</button>
        </div>
        <aside className="persistent-brief-preview editable-brief-preview">
          <label className="brief-edit-field"><small>Meeting type</small><input value={brief.type} onChange={(event) => setBriefField('type', event.target.value)} /></label>
          <label className="brief-edit-field"><small>Goal</small><textarea value={brief.goal} onChange={(event) => setBriefField('goal', event.target.value)} /></label>
          {assistantDraft && <div className="brief-summary">{assistantDraft.insights.map((item) => <small key={item}>{item}</small>)}</div>}
          <div className="qualification-preview editable-questions"><small>Guest questions · editable</small><ol>{brief.questions.map((question, index) => <li key={`${index}-${question.slice(0, 20)}`}><input value={question} onChange={(event) => setBriefQuestion(index, event.target.value)} /></li>)}</ol></div>
          <label className="brief-edit-field"><small>Invite message</small><textarea value={brief.message} onChange={(event) => setBriefField('message', event.target.value)} /></label>
          <label className="private-note-input">Private notes<textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Anything only you should see before the call." /></label>
          <small className="persist-hint">Review every generated field before sending. This brief, guest questions, guest answers, and private notes will stay attached to the meeting.</small>
        </aside>
      </div>

      <div className="create-grid">
        <form className="form" onSubmit={(event) => event.preventDefault()}>
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
        <aside className="slot-panel"><p className="eyebrow">Selected slots</p><h3>{selected.length} ready to share</h3><p>Choose the moments your guest can book from.</p>{slots.length ? <div className="slot-grid">{slots.map((slot) => <button type="button" className={selected.includes(slot) ? 'slot selected' : 'slot'} key={slot} onClick={() => toggle(slot)}>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div> : <div className="empty dark">Available slots will appear here.</div>} {!!slots.length && <button className="btn success" type="button" onClick={create}>Create request with {selected.length} slots</button>}</aside>
      </div>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function SelectSlotPage() {
  const [meeting, setMeeting] = useState(null);
  const [slots, setSlots] = useState([]);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');
  const [busySlotId, setBusySlotId] = useState(null);
  const uniqueLink = window.location.pathname.split('/').pop();

  useEffect(() => {
    axios.get(`${API_URL}/api/meetings/${uniqueLink}`).then((response) => {
      const nextMeeting = response.data.meeting;
      setMeeting(nextMeeting);
      setSlots(response.data.slots || []);
      setAnswers(Object.fromEntries((nextMeeting.qualificationQuestions || []).map((question) => [question, ''])));
    }).catch((error) => setMessage(error.response?.data?.error || 'Error loading meeting slots'));
  }, [uniqueLink]);

  async function choose(slot) {
    const questions = meeting?.qualificationQuestions || [];
    if (questions.some((question) => !(answers[question] || '').trim())) {
      setMessage('Please answer each question before choosing a time.');
      return;
    }

    setBusySlotId(slot.id);
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/meetings/select-slot/${uniqueLink}`, {
        slotId: slot.id,
        guestAnswers: questions.map((question) => ({ question, answer: answers[question] || '' })),
      });
      setMeeting((current) => ({ ...current, status: 'confirmed', selectedSlot: slot.slot_time }));
      const emailDelivery = response.data.delivery?.confirmationEmail;
      const cleanupComplete = response.data.delivery?.calendar?.holdCleanupComplete;
      if (emailDelivery && (!emailDelivery.attendeeSent || !emailDelivery.hostSent)) {
        setMessage('Meeting confirmed on the calendar, but one or more confirmation emails could not be verified as sent.');
      } else if (cleanupComplete === false) {
        setMessage('Meeting confirmed. One unused calendar hold still needs cleanup on the host side.');
      } else {
        setMessage('Meeting confirmed. Calendar invitations and confirmation emails were sent.');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error selecting slot');
    } finally {
      setBusySlotId(null);
    }
  }

  return (
    <main className="booking-screen stage3-booking-screen">
      <section className="panel booking stage3-booking">
        <Brand />
        <p className="eyebrow">Meeting invite</p>
        <h1>{meeting?.meetingType || 'Select your meeting time'}</h1>
        {meeting?.inviteMessage ? <p className="booking-invite-message">{meeting.inviteMessage}</p> : <p>Choose the time that works best from the host-approved options.</p>}

        {meeting?.meetingGoal && <aside className="booking-goal"><span>What this meeting is about</span><p>{meeting.meetingGoal}</p></aside>}
        {meeting && <p className="booking-invite-message">Duration: {meeting.durationMinutes || 60} minutes.</p>}
        {meeting?.status && <p className={`notice ${meeting.status}`}>Status: {meeting.status}{meeting.selectedSlot ? ` for ${formatDateTime(meeting.selectedSlot)}` : ''}</p>}
        {meeting?.status === 'cancelled' && <p>This meeting request is no longer available.</p>}

        {!!meeting?.qualificationQuestions?.length && meeting?.status === 'pending' && (
          <section className="guest-question-section">
            <div><p className="eyebrow">A little context first</p><h2>Help the host prepare.</h2><p>Your answers stay attached to this meeting so the conversation can start with context.</p></div>
            <div className="guest-question-list">
              {meeting.qualificationQuestions.map((question, index) => (
                <label key={question}><span>{index + 1}. {question}</span><textarea value={answers[question] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))} placeholder="Your answer" /></label>
              ))}
            </div>
          </section>
        )}

        {meeting?.status !== 'cancelled' && meeting?.status !== 'confirmed' && (
          <section className="booking-time-section">
            <div><p className="eyebrow">Approved availability</p><h2>Choose a time.</h2></div>
            <div className="slot-grid">{slots.map((slot) => <button className="slot" disabled={busySlotId !== null} key={slot.id} onClick={() => choose(slot)}>{busySlotId === slot.id ? 'Confirming…' : new Date(slot.slot_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</button>)}</div>
          </section>
        )}
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

export default function Stage4Product() {
  const pathname = window.location.pathname;
  if (pathname === '/dashboard') return <Dashboard />;
  if (pathname.startsWith('/select-slot/')) return <SelectSlotPage />;
  return null;
}
