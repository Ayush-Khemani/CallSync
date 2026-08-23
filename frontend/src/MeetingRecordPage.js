import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { buildPreCallBrief } from './stage5Workflow';
import { buildFollowUpMessage, getFollowUpMeta, getFollowUpRisk } from './followUpWorkflow';
import './ProductWorkspace.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Brand() {
  return <a className="pw-brand dark" href="/"><span>CS</span><strong>CallSync</strong></a>;
}

function outcomeDraft(meeting) {
  return {
    happened: meeting.happened ?? null,
    useful: meeting.useful ?? null,
    nextStep: meeting.nextStep || '',
    followUpAt: toLocalInput(meeting.followUpAt),
    notes: meeting.notes || '',
  };
}

function memoryDraft(memory) {
  return {
    notes: memory?.notes || '',
    summary: memory?.summary || '',
    keyPoints: [...(memory?.keyPoints || [])],
    decisions: [...(memory?.decisions || [])],
    actionItems: (memory?.actionItems || []).map((item) => ({ task: item.task || '', owner: item.owner || '', dueAt: item.dueAt || '' })),
    unansweredQuestions: [...(memory?.unansweredQuestions || [])],
  };
}

function Choice({ value, onChange }) {
  return (
    <div className="mr-choice">
      <button type="button" className={value === true ? 'active' : ''} onClick={() => onChange(true)}>Yes</button>
      <button type="button" className={value === false ? 'active' : ''} onClick={() => onChange(false)}>No</button>
      <button type="button" className={value === null ? 'active' : ''} onClick={() => onChange(null)}>Not set</button>
    </div>
  );
}

function Timeline({ meeting, memory }) {
  const items = [
    ['Request created', meeting.createdAt],
    ['Request email sent', meeting.requestEmailSentAt],
    ['Meeting booked', meeting.selectedSlot],
    ['Guest confirmation sent', meeting.confirmationAttendeeEmailSentAt],
    ['Host confirmation sent', meeting.confirmationHostEmailSentAt],
    ['Last follow-up', meeting.lastFollowedUpAt],
    ['Outcome recorded', meeting.recordedAt],
    ['Memory saved', memory?.memoryUpdatedAt],
  ].filter(([, value]) => value);

  return (
    <div className="mr-timeline">
      {items.length ? items.map(([label, value]) => <div key={label}><i /><span>{label}</span><strong>{formatDateTime(value)}</strong></div>) : <p>No activity recorded yet.</p>}
    </div>
  );
}

export default function MeetingRecordPage() {
  const meetingId = Number(window.location.pathname.split('/').filter(Boolean).pop());
  const [meeting, setMeeting] = useState(null);
  const [integrations, setIntegrations] = useState({ google: {}, outlook: {} });
  const [allMemories, setAllMemories] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [prep, setPrep] = useState(null);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [memory, setMemory] = useState(null);
  const [internalNotes, setInternalNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, followUpResponse, outcomeResponse, memoryResponse, integrationsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }).catch(() => ({ data: { followUps: [] } })),
        axios.get(`${API_URL}/api/meetings/outcome-state`, { headers: authHeaders() }).catch(() => ({ data: { outcomes: [] } })),
        axios.get(`${API_URL}/api/meetings/memory-state`, { headers: authHeaders() }).catch(() => ({ data: { memories: [] } })),
        axios.get(`${API_URL}/api/integrations/status`, { headers: authHeaders() }).catch(() => ({ data: { google: {}, outlook: {} } })),
      ]);

      const base = (meetingsResponse.data.meetings || []).find((item) => item.id === meetingId);
      if (!base) {
        setMeeting(null);
        setMessage('Meeting not found.');
        return;
      }
      const followUp = (followUpResponse.data.followUps || []).find((item) => item.meetingId === meetingId) || {};
      const savedOutcome = (outcomeResponse.data.outcomes || []).find((item) => item.meetingId === meetingId) || {};
      const merged = { ...base, ...followUp, ...savedOutcome };
      const memories = memoryResponse.data.memories || [];
      const savedMemory = memories.find((item) => item.meetingId === meetingId) || null;

      setMeeting(merged);
      setIntegrations(integrationsResponse.data || { google: {}, outlook: {} });
      setAllMemories(memories);
      setPrep(buildPreCallBrief(merged));
      setFollowUpDraft(buildFollowUpMessage(merged, `${window.location.origin}/select-slot/${merged.uniqueLink}`));
      setOutcome(outcomeDraft(merged));
      setMemory(memoryDraft(savedMemory));
      setInternalNotes(merged.internalNotes || '');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load this meeting record.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      window.location.replace('/login');
      return;
    }
    load();
  }, [meetingId]);

  const savedMemory = useMemo(() => allMemories.find((item) => item.meetingId === meetingId) || null, [allMemories, meetingId]);
  const relationshipHistory = useMemo(() => {
    if (!meeting) return [];
    return allMemories.filter((item) => item.attendeeEmail === meeting.attendeeEmail && item.meetingId !== meeting.id);
  }, [allMemories, meeting]);

  if (loading) return <main className="mr-screen"><div className="mr-loading">Loading meeting record…</div></main>;
  if (!meeting) return <main className="mr-screen"><div className="mr-loading"><h2>Meeting not found</h2><a href="/dashboard">← Back to pipeline</a></div></main>;

  const risk = getFollowUpRisk(meeting);
  const followUpMeta = getFollowUpMeta(meeting);
  const canSendGoogle = Boolean(integrations.google?.mailSendEnabled);
  const canSendOutlook = Boolean(integrations.outlook?.mailSendEnabled);
  const bookingUrl = `${window.location.origin}/select-slot/${meeting.uniqueLink}`;

  function updateMeeting(patch) {
    setMeeting((current) => ({ ...current, ...patch }));
  }

  async function copyBookingLink() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setMessage('Booking link copied.');
    } catch {
      setMessage(bookingUrl);
    }
  }

  async function saveInternalNotes() {
    setBusy('notes');
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/notes`, { internalNotes }, { headers: authHeaders() });
      updateMeeting({ internalNotes: response.data.internalNotes });
      setMessage('Private notes saved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save private notes.');
    } finally {
      setBusy('');
    }
  }

  async function cancelMeeting() {
    if (!window.confirm('Cancel this meeting request and clean up its calendar events?')) return;
    setBusy('cancel');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/meetings/cancel/${meeting.uniqueLink}`, {}, { headers: authHeaders() });
      updateMeeting({ status: 'cancelled' });
      setMessage(response.data.delivery?.calendarCleanupComplete === false
        ? 'Meeting cancelled, but one or more calendar events still need cleanup.'
        : 'Meeting cancelled and calendar events cleaned up.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not cancel the meeting.');
    } finally {
      setBusy('');
    }
  }

  async function refreshPrep() {
    setBusy('prep');
    setMessage('');
    const fallback = buildPreCallBrief(meeting);
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, { kind: 'pre_call', meetingId: meeting.id }, { headers: authHeaders() });
      setPrep(response.data.output || fallback);
      setMessage('Preparation refreshed. Review it before the call.');
    } catch {
      setPrep(fallback);
      setMessage('Built-in preparation restored because assisted generation was unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function refreshFollowUp() {
    setBusy('followup-generate');
    setMessage('');
    const fallback = buildFollowUpMessage(meeting, bookingUrl);
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'follow_up', meetingId: meeting.id, context: { bookingUrl },
      }, { headers: authHeaders() });
      setFollowUpDraft(response.data.output?.message || fallback);
    } catch {
      setFollowUpDraft(fallback);
      setMessage('Built-in follow-up restored because assisted generation was unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function sendFollowUp(provider) {
    if (!followUpDraft.trim()) return;
    setBusy(`send-${provider}`);
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/meetings/${meeting.id}/send-follow-up`, { provider, message: followUpDraft.trim() }, { headers: authHeaders() });
      updateMeeting(response.data.followUp || {});
      setMessage(`Follow-up sent through ${provider === 'google' ? 'Gmail' : 'Outlook'} and recorded.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not send the follow-up.');
    } finally {
      setBusy('');
    }
  }

  async function markManualFollowUp() {
    setBusy('manual-followup');
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/follow-up`, {}, { headers: authHeaders() });
      updateMeeting(response.data.followUp || {});
      setMessage('Manual follow-up recorded.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not record the follow-up.');
    } finally {
      setBusy('');
    }
  }

  function setOutcomeField(key, value) {
    setOutcome((current) => ({ ...current, [key]: value }));
  }

  async function suggestNextStep() {
    setBusy('next-step');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'next_step', meetingId: meeting.id,
        context: { happened: outcome.happened, useful: outcome.useful, nextStep: outcome.nextStep, notes: outcome.notes },
      }, { headers: authHeaders() });
      if (response.data.output?.nextStep) setOutcomeField('nextStep', response.data.output.nextStep);
      setMessage(response.data.output?.followUpHint || 'Next-step suggestion refreshed.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not generate a next-step suggestion.');
    } finally {
      setBusy('');
    }
  }

  async function saveOutcome() {
    setBusy('outcome');
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/outcome`, {
        happened: outcome.happened,
        useful: outcome.useful,
        nextStep: outcome.nextStep,
        followUpAt: outcome.followUpAt || null,
        notes: outcome.notes,
      }, { headers: authHeaders() });
      const saved = response.data.outcome;
      updateMeeting(saved);
      setOutcome(outcomeDraft({ ...meeting, ...saved }));
      setMessage('Outcome saved to the meeting record.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save the meeting outcome.');
    } finally {
      setBusy('');
    }
  }

  function setMemoryField(key, value) {
    setMemory((current) => ({ ...current, [key]: value }));
  }

  async function generateMemory() {
    if (!memory.notes.trim()) {
      setMessage('Capture meeting notes first. Memory is only generated from context you actually provide.');
      return;
    }
    setBusy('memory-generate');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'meeting_memory', meetingId: meeting.id, context: { notes: memory.notes },
      }, { headers: authHeaders() });
      setMemory((current) => ({ ...current, ...(response.data.output || {}) }));
      setMessage('Meeting memory generated from your captured notes. Review it before saving.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not generate meeting memory.');
    } finally {
      setBusy('');
    }
  }

  async function saveMemory() {
    setBusy('memory-save');
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/memory`, memory, { headers: authHeaders() });
      const saved = response.data.memory;
      setAllMemories((current) => current.some((item) => item.meetingId === saved.meetingId)
        ? current.map((item) => item.meetingId === saved.meetingId ? saved : item)
        : [...current, saved]);
      setMemory(memoryDraft(saved));
      setMessage('Meeting memory saved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save meeting memory.');
    } finally {
      setBusy('');
    }
  }

  function listText(values) {
    return (values || []).join('\n');
  }

  function parseList(value) {
    return value.split('\n').map((item) => item.trim()).filter(Boolean);
  }

  const tabs = [
    ['overview', 'Overview'],
    ['prepare', 'Prepare'],
    ['followup', 'Follow-up'],
    ['outcome', 'Outcome'],
    ['memory', 'Memory'],
    ['activity', 'Activity'],
  ];

  return (
    <main className="mr-screen">
      <header className="mr-topbar">
        <Brand />
        <a href="/dashboard" className="mr-back">← Back to pipeline</a>
      </header>

      <section className="mr-shell">
        <header className="mr-record-head">
          <div className="mr-title-block">
            <div className="mr-title-meta"><span className="pw-type-chip">{meeting.meetingType || 'General meeting'}</span><span className={`mr-status status-${meeting.status}`}>{meeting.status}</span></div>
            <h1>{meeting.attendeeName || 'Unnamed guest'}</h1>
            <p>{meeting.attendeeEmail} · {meeting.status === 'confirmed' ? formatDateTime(meeting.selectedSlot) : 'Waiting for booking'} · {meeting.durationMinutes || 60} min</p>
          </div>
          <div className="mr-head-actions">
            <a className="pw-secondary-button" href={bookingUrl} target="_blank" rel="noreferrer">Open booking page</a>
            <button className="pw-secondary-button" type="button" onClick={copyBookingLink}>Copy link</button>
            {meeting.status !== 'cancelled' && <button className="mr-danger-button" type="button" disabled={busy === 'cancel'} onClick={cancelMeeting}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>}
          </div>
        </header>

        {risk.level !== 'none' && <div className={`mr-attention risk-${risk.level}`}><strong>{risk.label}</strong><span>{risk.detail}</span></div>}
        {message && <div className="pw-message">{message}</div>}

        <nav className="mr-tabs" aria-label="Meeting record sections">
          {tabs.map(([id, label]) => <button type="button" key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}
        </nav>

        {activeTab === 'overview' && (
          <div className="mr-content-grid">
            <section className="mr-card large">
              <span className="mr-label">Meeting brief</span>
              <h2>{meeting.meetingGoal || 'No goal captured yet.'}</h2>
              {meeting.inviteMessage && <p>{meeting.inviteMessage}</p>}
              {!!meeting.qualificationQuestions?.length && <div className="mr-question-list">{meeting.qualificationQuestions.map((question, index) => <div key={`${question}-${index}`}><span>{index + 1}</span><p>{question}</p></div>)}</div>}
            </section>
            <section className="mr-card">
              <span className="mr-label">Guest context</span>
              <h2>What they told you</h2>
              {meeting.guestAnswers?.length ? meeting.guestAnswers.map((item, index) => <div className="mr-answer" key={`${item.question}-${index}`}><strong>{item.question}</strong><p>{item.answer || 'No answer provided'}</p></div>) : <p className="mr-muted">Guest answers will appear after booking.</p>}
            </section>
            <section className="mr-card">
              <span className="mr-label">Logistics</span>
              <dl className="mr-facts">
                <div><dt>Status</dt><dd>{meeting.status}</dd></div>
                <div><dt>Duration</dt><dd>{meeting.durationMinutes || 60} min</dd></div>
                <div><dt>Selected time</dt><dd>{formatDateTime(meeting.selectedSlot)}</dd></div>
                <div><dt>Offered slots</dt><dd>{meeting.slotCount || 0}</dd></div>
                <div><dt>Created</dt><dd>{formatDateTime(meeting.createdAt)}</dd></div>
              </dl>
            </section>
            <section className="mr-card large">
              <div className="mr-card-head"><div><span className="mr-label">Private notes</span><h2>Host context</h2></div><button className="pw-secondary-button" type="button" disabled={busy === 'notes'} onClick={saveInternalNotes}>{busy === 'notes' ? 'Saving…' : 'Save notes'}</button></div>
              <textarea className="mr-editor tall" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Context, reminders, or anything only you should see." />
            </section>
          </div>
        )}

        {activeTab === 'prepare' && (
          <section className="mr-card mr-focus-card">
            <div className="mr-card-head"><div><span className="mr-label">Pre-call preparation</span><h2>Walk into the meeting with context.</h2></div><button className="pw-secondary-button" type="button" disabled={busy === 'prep'} onClick={refreshPrep}>{busy === 'prep' ? 'Refreshing…' : 'Refresh preparation'}</button></div>
            {meeting.status !== 'confirmed' ? <div className="mr-empty-tab">Preparation becomes available after the guest books a time.</div> : prep && <div className="mr-prep-layout">
              <label><span>Goal</span><textarea className="mr-editor" value={prep.goal || ''} onChange={(event) => setPrep((current) => ({ ...current, goal: event.target.value }))} /></label>
              <div><span className="mr-field-label">Agenda</span><ol className="mr-agenda">{(prep.agenda || []).map((item, index) => <li key={index}><span>{index + 1}</span><textarea value={item} onChange={(event) => setPrep((current) => ({ ...current, agenda: current.agenda.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry) }))} /></li>)}</ol></div>
              <label><span>Opening prompt</span><textarea className="mr-editor" value={prep.openingPrompt || ''} onChange={(event) => setPrep((current) => ({ ...current, openingPrompt: event.target.value }))} /></label>
            </div>}
          </section>
        )}

        {activeTab === 'followup' && (
          <section className="mr-card mr-focus-card">
            <div className="mr-card-head"><div><span className="mr-label">Follow-up workflow</span><h2>{meeting.status === 'pending' ? 'Keep the invite moving.' : 'Communication history'}</h2></div><span className="mr-meta-pill">{followUpMeta.count} follow-up{followUpMeta.count === 1 ? '' : 's'} recorded</span></div>
            <div className="mr-inline-facts"><span>Last: {followUpMeta.lastLabel}</span><span>Next: {followUpMeta.nextLabel}</span>{meeting.lastFollowUpProvider && <span>Channel: {meeting.lastFollowUpProvider}</span>}</div>
            {meeting.status === 'pending' ? <>
              <textarea className="mr-editor tall" value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} />
              <div className="mr-action-row">
                <button className="pw-secondary-button" type="button" disabled={busy === 'followup-generate'} onClick={refreshFollowUp}>Refresh suggestion</button>
                {canSendGoogle && <button className="pw-primary-button" type="button" disabled={Boolean(busy)} onClick={() => sendFollowUp('google')}>Send with Gmail</button>}
                {canSendOutlook && <button className="pw-primary-button" type="button" disabled={Boolean(busy)} onClick={() => sendFollowUp('outlook')}>Send with Outlook</button>}
                <button className="pw-secondary-button" type="button" disabled={Boolean(busy)} onClick={markManualFollowUp}>Record manual follow-up</button>
              </div>
              {!canSendGoogle && !canSendOutlook && <p className="mr-muted">Connect Gmail or Outlook Mail in Calendars to send directly from CallSync.</p>}
            </> : <p className="mr-muted">This meeting is no longer waiting for the guest. Previous follow-up activity remains part of the record.</p>}
          </section>
        )}

        {activeTab === 'outcome' && (
          <section className="mr-card mr-focus-card">
            <div className="mr-card-head"><div><span className="mr-label">Post-call outcome</span><h2>Turn the meeting into a next action.</h2></div><button className="pw-primary-button" type="button" disabled={busy === 'outcome'} onClick={saveOutcome}>{busy === 'outcome' ? 'Saving…' : 'Save outcome'}</button></div>
            {meeting.status !== 'confirmed' ? <div className="mr-empty-tab">Outcome tracking becomes available after the meeting is booked.</div> : outcome && <div className="mr-outcome-grid">
              <label><span>Did it happen?</span><Choice value={outcome.happened} onChange={(value) => setOutcomeField('happened', value)} /></label>
              <label><span>Was it useful?</span><Choice value={outcome.useful} onChange={(value) => setOutcomeField('useful', value)} /></label>
              <label className="wide"><span>Next step</span><textarea className="mr-editor" value={outcome.nextStep} onChange={(event) => setOutcomeField('nextStep', event.target.value)} placeholder="What should happen next?" /><button className="mr-text-action" type="button" disabled={busy === 'next-step'} onClick={suggestNextStep}>{busy === 'next-step' ? 'Suggesting…' : 'Suggest next step'}</button></label>
              <label><span>Follow-up date</span><input type="datetime-local" value={outcome.followUpAt} onChange={(event) => setOutcomeField('followUpAt', event.target.value)} /></label>
              <label className="wide"><span>Outcome notes</span><textarea className="mr-editor tall" value={outcome.notes} onChange={(event) => setOutcomeField('notes', event.target.value)} placeholder="Decisions, objections, commitments, or context worth carrying forward." /></label>
            </div>}
          </section>
        )}

        {activeTab === 'memory' && (
          <section className="mr-card mr-focus-card">
            <div className="mr-card-head"><div><span className="mr-label">Meeting memory</span><h2>What happened, what matters, what comes next.</h2></div><div className="mr-action-row"><button className="pw-secondary-button" type="button" disabled={busy === 'memory-generate'} onClick={generateMemory}>{busy === 'memory-generate' ? 'Generating…' : 'Generate from notes'}</button><button className="pw-primary-button" type="button" disabled={busy === 'memory-save'} onClick={saveMemory}>{busy === 'memory-save' ? 'Saving…' : 'Save memory'}</button></div></div>
            {meeting.status !== 'confirmed' ? <div className="mr-empty-tab">Meeting memory is only available for booked meetings.</div> : memory && <div className="mr-memory-layout">
              <label><span>Captured notes · source of truth</span><textarea className="mr-editor source" value={memory.notes} onChange={(event) => setMemoryField('notes', event.target.value)} placeholder="Write what actually happened before generating memory." /></label>
              <label><span>Summary</span><textarea className="mr-editor" value={memory.summary} onChange={(event) => setMemoryField('summary', event.target.value)} /></label>
              <div className="mr-memory-grid">
                <label><span>Key points · one per line</span><textarea className="mr-editor tall" value={listText(memory.keyPoints)} onChange={(event) => setMemoryField('keyPoints', parseList(event.target.value))} /></label>
                <label><span>Decisions · one per line</span><textarea className="mr-editor tall" value={listText(memory.decisions)} onChange={(event) => setMemoryField('decisions', parseList(event.target.value))} /></label>
                <label><span>Unanswered questions · one per line</span><textarea className="mr-editor tall" value={listText(memory.unansweredQuestions)} onChange={(event) => setMemoryField('unansweredQuestions', parseList(event.target.value))} /></label>
              </div>
              <div className="mr-action-items"><span className="mr-field-label">Action items</span>{memory.actionItems.length ? memory.actionItems.map((item, index) => <div key={index}><textarea value={item.task} onChange={(event) => setMemoryField('actionItems', memory.actionItems.map((entry, entryIndex) => entryIndex === index ? { ...entry, task: event.target.value } : entry))} placeholder="Action" /><input value={item.owner} onChange={(event) => setMemoryField('actionItems', memory.actionItems.map((entry, entryIndex) => entryIndex === index ? { ...entry, owner: event.target.value } : entry))} placeholder="Owner" /><input value={item.dueAt} onChange={(event) => setMemoryField('actionItems', memory.actionItems.map((entry, entryIndex) => entryIndex === index ? { ...entry, dueAt: event.target.value } : entry))} placeholder="Deadline" /></div>) : <p className="mr-muted">No action items captured yet.</p>}<button className="mr-text-action" type="button" onClick={() => setMemoryField('actionItems', [...memory.actionItems, { task: '', owner: '', dueAt: '' }])}>+ Add action item</button></div>
              <div className="mr-relationship"><span className="mr-label">Relationship continuity</span><h3>Previous meetings with {meeting.attendeeName}</h3>{relationshipHistory.length ? relationshipHistory.map((item) => <a href={`/meeting/${item.meetingId}`} key={item.meetingId}><span>{formatDateTime(item.selectedSlot)}</span><strong>{item.summary || item.outcomeNextStep || item.meetingGoal || 'Meeting record'}</strong></a>) : <p className="mr-muted">This is the first booked meeting with this attendee in CallSync.</p>}</div>
            </div>}
          </section>
        )}

        {activeTab === 'activity' && (
          <section className="mr-card mr-focus-card"><span className="mr-label">Activity</span><h2>The meeting lifecycle.</h2><Timeline meeting={meeting} memory={savedMemory} /></section>
        )}
      </section>
    </main>
  );
}
