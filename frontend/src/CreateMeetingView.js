import React, { useState } from 'react';
import axios from 'axios';
import { MEETING_TEMPLATES, buildMeetingDraftFromPrompt } from './App';
import { API_URL, authHeaders } from './workspaceShared';

export default function CreateMeetingView({ onDone }) {
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
    <section className="pw-page pw-create-page create-simple-page">
      <header className="pw-page-head compact create-simple-head">
        <div>
          <p className="pw-kicker">New meeting</p>
          <h1>Schedule a meeting</h1>
          <p>Choose who it is with, find a few good times, and send the request.</p>
        </div>
      </header>

      <div className="create-simple-flow">
        <section className="create-simple-step">
          <header className="create-simple-step-head">
            <span>1</span>
            <div><h2>Who and when?</h2><p>Start with the information required to find availability.</p></div>
          </header>

          <div className="pw-form-grid two create-core-fields">
            <label><span>Guest name</span><input value={form.attendeeName} onChange={(event) => set('attendeeName', event.target.value)} placeholder="Maya Chen" /></label>
            <label><span>Guest email</span><input type="email" value={form.attendeeEmail} onChange={(event) => set('attendeeEmail', event.target.value)} placeholder="maya@company.com" /></label>
            <label><span>Date</span><input type="date" value={form.selectedDate} onChange={(event) => set('selectedDate', event.target.value)} /></label>
            <label><span>Duration</span><select value={form.durationMinutes} onChange={(event) => set('durationMinutes', Number(event.target.value))}>{[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label>
          </div>

          <details className="pw-advanced-settings create-availability-settings">
            <summary>Availability settings</summary>
            <div className="pw-form-grid three">
              <label><span>Buffer</span><select value={form.bufferMinutes} onChange={(event) => set('bufferMinutes', Number(event.target.value))}>{[0, 5, 10, 15, 30].map((value) => <option key={value} value={value}>{value ? `${value} min` : 'None'}</option>)}</select></label>
              <label><span>Interval</span><select value={form.slotIntervalMinutes} onChange={(event) => set('slotIntervalMinutes', Number(event.target.value))}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
              <label><span>Timezone</span><input value={form.timeZone} onChange={(event) => set('timeZone', event.target.value)} /></label>
              <label><span>Workday starts</span><input type="number" min="0" max="23" value={form.workStartHour} onChange={(event) => set('workStartHour', Number(event.target.value))} /></label>
              <label><span>Workday ends</span><input type="number" min="1" max="24" value={form.workEndHour} onChange={(event) => set('workEndHour', Number(event.target.value))} /></label>
            </div>
          </details>

          <div className="create-step-actions">
            <button className="pw-primary-button" type="button" onClick={fetchSlots} disabled={busy === 'slots'}>{busy === 'slots' ? 'Checking calendars…' : 'Find available times'}</button>
          </div>
        </section>

        <details className="create-context-card">
          <summary>
            <div><strong>Add meeting context</strong><small>Optional</small></div>
            <span>Goal, invite message, guest questions and private notes</span>
          </summary>

          <div className="create-context-body">
            <div className="create-context-assist">
              <label>
                <span>Describe the meeting</span>
                <textarea className="pw-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: 30 minute investor intro. Ask what fund they are with and what they want to discuss." />
              </label>
              <div className="pw-template-row">
                {Object.entries(MEETING_TEMPLATES).map(([key, template]) => (
                  <button key={key} type="button" onClick={() => applyDraft(buildMeetingDraftFromPrompt(template.label))}>
                    <strong>{template.label}</strong><span>{template.durationMinutes} min</span>
                  </button>
                ))}
              </div>
              <button className="pw-secondary-button" type="button" onClick={generateBrief} disabled={busy === 'brief'}>{busy === 'brief' ? 'Generating…' : 'Generate from description'}</button>
            </div>

            <div className="pw-brief-editor create-brief-fields">
              <label><span>Meeting type</span><input value={brief.type} onChange={(event) => setBriefField('type', event.target.value)} /></label>
              <label><span>Goal</span><textarea value={brief.goal} onChange={(event) => setBriefField('goal', event.target.value)} /></label>
              <label><span>Invite message</span><textarea value={brief.message} onChange={(event) => setBriefField('message', event.target.value)} /></label>
              <div className="pw-question-editor">
                <span>Guest questions</span>
                {brief.questions.map((question, index) => <input key={`question-${index}`} value={question} onChange={(event) => setQuestion(index, event.target.value)} />)}
              </div>
              <label><span>Private notes</span><textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Only you will see these notes." /></label>
            </div>
          </div>
        </details>

        <section className={`create-simple-step create-time-step ${slots.length ? 'ready' : ''}`}>
          <header className="create-simple-step-head">
            <span>2</span>
            <div><h2>Choose the times to offer</h2><p>Only the times you select will be shown to the guest.</p></div>
            {!!slots.length && <b>{selected.length} selected</b>}
          </header>

          {slots.length ? (
            <>
              <div className="create-time-grid">{slots.map((slot) => <button type="button" className={selected.includes(slot) ? 'selected' : ''} key={slot} onClick={() => toggleSlot(slot)}><strong>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><span>{new Date(slot).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span></button>)}</div>
              <div className="create-review-bar">
                <div><strong>{selected.length ? `${selected.length} time${selected.length === 1 ? '' : 's'} ready to send` : 'Choose at least one time'}</strong><span>{form.attendeeName || form.attendeeEmail || 'Guest'} · {form.durationMinutes} min</span></div>
                <button className="pw-primary-button" type="button" onClick={createMeeting} disabled={!selected.length || busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create and send request'}</button>
              </div>
            </>
          ) : (
            <div className="create-time-empty">Find available times above. Your calendar options will appear here.</div>
          )}
        </section>
      </div>

      {message && <div className={`pw-message create-feedback ${createdLink ? 'success' : ''}`}>{message}{createdLink && <div className="pw-created-actions"><button type="button" onClick={copyCreatedLink}>Copy booking link</button><button type="button" onClick={onDone}>Open pipeline</button></div>}</div>}
    </section>
  );
}
