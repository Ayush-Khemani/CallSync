import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { buildPreCallBrief, filterBookedMeetings, getMeetingNextAction, sortByNextAction } from './stage5Workflow';
import './Stage5Prep.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function draftFromMeeting(meeting) {
  return {
    happened: meeting.happened ?? null,
    useful: meeting.useful ?? null,
    nextStep: meeting.nextStep || '',
    followUpAt: toLocalInput(meeting.followUpAt),
    notes: meeting.notes || '',
  };
}

function Choice({ label, value, onChange }) {
  return (
    <div className="stage5-choice">
      <span>{label}</span>
      <div className="stage5-choice-buttons">
        <button type="button" className={value === true ? 'active' : ''} onClick={() => onChange(true)}>Yes</button>
        <button type="button" className={value === false ? 'active' : ''} onClick={() => onChange(false)}>No</button>
        <button type="button" className={value === null ? 'active' : ''} onClick={() => onChange(null)}>Not set</button>
      </div>
    </div>
  );
}

export function Stage5Launcher() {
  return <a className="stage5-launcher" href="/prepare"><span>↗</span>Prepare & outcomes</a>;
}

export default function Stage5Prep() {
  const [meetings, setMeetings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      window.location.replace('/login');
      return;
    }

    async function load() {
      setLoading(true);
      setMessage('');
      try {
        const [meetingsResponse, outcomesResponse] = await Promise.all([
          axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
          axios.get(`${API_URL}/api/meetings/outcome-state`, { headers: authHeaders() }),
        ]);
        const outcomeById = new Map((outcomesResponse.data.outcomes || []).map((item) => [item.meetingId, item]));
        const nextMeetings = (meetingsResponse.data.meetings || []).map((meeting) => ({ ...meeting, ...(outcomeById.get(meeting.id) || {}) }));
        setMeetings(nextMeetings);
        setDrafts(Object.fromEntries(nextMeetings.map((meeting) => [meeting.id, draftFromMeeting(meeting)])));
      } catch (error) {
        setMessage(error.response?.data?.error || 'Could not load preparation workspace');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const booked = useMemo(() => meetings.filter((meeting) => meeting.status === 'confirmed'), [meetings]);
  const summary = useMemo(() => ({
    prepare: booked.filter((meeting) => getMeetingNextAction(meeting).id === 'prepare').length,
    outcomeDue: booked.filter((meeting) => getMeetingNextAction(meeting).id === 'outcomeDue').length,
    nextAction: booked.filter((meeting) => getMeetingNextAction(meeting).id === 'nextAction').length,
  }), [booked]);
  const visible = useMemo(() => sortByNextAction(filterBookedMeetings(meetings, filter)), [meetings, filter]);

  function setDraft(meetingId, key, value) {
    setDrafts((current) => ({
      ...current,
      [meetingId]: { ...(current[meetingId] || {}), [key]: value },
    }));
  }

  async function saveOutcome(meeting) {
    const draft = drafts[meeting.id] || draftFromMeeting(meeting);
    setSavingId(meeting.id);
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${meeting.id}/outcome`, {
        happened: draft.happened,
        useful: draft.useful,
        nextStep: draft.nextStep,
        followUpAt: draft.followUpAt || null,
        notes: draft.notes,
      }, { headers: authHeaders() });
      const outcome = response.data.outcome;
      setMeetings((current) => current.map((item) => item.id === meeting.id ? { ...item, ...outcome } : item));
      setDrafts((current) => ({ ...current, [meeting.id]: draftFromMeeting({ ...meeting, ...outcome }) }));
      setMessage(`Outcome saved for ${meeting.attendeeName}.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save meeting outcome');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="stage5-screen">
      <header className="stage5-topbar">
        <a className="stage5-brand" href="/"><span>CS</span>CallSync</a>
        <div className="stage5-top-actions">
          <a className="stage5-button secondary" href="/dashboard">← Pipeline</a>
        </div>
      </header>

      <section className="stage5-main">
        <div className="stage5-hero">
          <div>
            <p className="stage5-eyebrow">Prepare & outcomes</p>
            <h1>Make the meeting useful before it starts—and actionable after it ends.</h1>
            <p>CallSync turns the goal and guest answers already attached to a booked meeting into a focused prep brief, then keeps the outcome and next step from disappearing into your calendar.</p>
          </div>
          <div className="stage5-summary">
            <article><span>Prepare</span><strong>{summary.prepare}</strong></article>
            <article><span>Outcome due</span><strong>{summary.outcomeDue}</strong></article>
            <article><span>Next action due</span><strong>{summary.nextAction}</strong></article>
          </div>
        </div>

        <nav className="stage5-filters" aria-label="Next action filters">
          {[
            ['all', 'All booked calls'],
            ['prepare', 'Prepare'],
            ['outcomeDue', 'Outcome due'],
            ['nextAction', 'Next action due'],
            ['scheduled', 'Scheduled next steps'],
            ['captured', 'Captured'],
          ].map(([id, label]) => <button type="button" key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}
        </nav>

        {loading && <div className="stage5-empty">Loading booked meetings…</div>}
        {!loading && !visible.length && <div className="stage5-empty">No booked meetings match this next-action filter yet.</div>}

        <div className="stage5-list">
          {visible.map((meeting) => {
            const brief = buildPreCallBrief(meeting);
            const action = getMeetingNextAction(meeting);
            const draft = drafts[meeting.id] || draftFromMeeting(meeting);
            const answers = Array.isArray(meeting.guestAnswers) ? meeting.guestAnswers : [];
            return (
              <article className="stage5-call-card" key={meeting.id}>
                <header className="stage5-call-head">
                  <div>
                    <small>{meeting.meetingType || 'General meeting'} · {formatDateTime(meeting.selectedSlot)}</small>
                    <h2>{meeting.attendeeName}</h2>
                    <p>{meeting.attendeeEmail}</p>
                  </div>
                  <span className={`stage5-action-chip ${action.id}`}>{action.label}</span>
                </header>

                <div className="stage5-card-grid">
                  <section className="stage5-prep">
                    <span className="stage5-section-label">Pre-call brief</span>
                    <p className="stage5-goal">{brief.goal}</p>
                    <ol className="stage5-agenda">
                      {brief.agenda.map((item, index) => <li key={`${meeting.id}-${index}`}><span>{index + 1}</span>{item}</li>)}
                    </ol>
                    <div className="stage5-opening">
                      <small>Opening prompt</small>
                      <p>{brief.openingPrompt}</p>
                    </div>
                    <div className="stage5-context">
                      {answers.map((item, index) => (
                        <details key={`${item.question}-${index}`}>
                          <summary>{item.question}</summary>
                          <p>{item.answer || 'No answer provided'}</p>
                        </details>
                      ))}
                      {meeting.internalNotes && <details><summary>Private host notes</summary><p>{meeting.internalNotes}</p></details>}
                    </div>
                  </section>

                  <section className="stage5-outcome">
                    <span className="stage5-section-label">Post-call outcome</span>
                    <h3>Leave the call with a next action.</h3>
                    <div className="stage5-choice-row">
                      <Choice label="Did it happen?" value={draft.happened} onChange={(value) => setDraft(meeting.id, 'happened', value)} />
                      <Choice label="Was it useful?" value={draft.useful} onChange={(value) => setDraft(meeting.id, 'useful', value)} />
                    </div>
                    <label className="stage5-field"><span>Next step</span><textarea value={draft.nextStep} onChange={(event) => setDraft(meeting.id, 'nextStep', event.target.value)} placeholder="Example: Send deck, introduce CTO, schedule technical follow-up…" /></label>
                    <label className="stage5-field"><span>Follow-up date</span><input type="datetime-local" value={draft.followUpAt} onChange={(event) => setDraft(meeting.id, 'followUpAt', event.target.value)} /></label>
                    <label className="stage5-field"><span>Outcome notes</span><textarea value={draft.notes} onChange={(event) => setDraft(meeting.id, 'notes', event.target.value)} placeholder="Decision, objections, commitments, or anything worth carrying into the next touch." /></label>
                    <div className="stage5-save-row">
                      <small>{meeting.recordedAt ? `Last recorded ${formatDateTime(meeting.recordedAt)}` : 'No outcome recorded yet'}</small>
                      <button className="stage5-button" type="button" disabled={savingId === meeting.id} onClick={() => saveOutcome(meeting)}>{savingId === meeting.id ? 'Saving…' : 'Save outcome'}</button>
                    </div>
                  </section>
                </div>
              </article>
            );
          })}
        </div>

        {message && <div className="stage5-message">{message}</div>}
      </section>
    </main>
  );
}
