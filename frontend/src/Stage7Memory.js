import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './Stage7Memory.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function draftFromMemory(memory) {
  return {
    notes: memory.notes || '',
    summary: memory.summary || '',
    keyPoints: [...(memory.keyPoints || [])],
    decisions: [...(memory.decisions || [])],
    actionItems: (memory.actionItems || []).map((item) => ({
      task: item.task || '',
      owner: item.owner || '',
      dueAt: item.dueAt || '',
    })),
    unansweredQuestions: [...(memory.unansweredQuestions || [])],
  };
}

function TextListEditor({ label, values, onChange, placeholder }) {
  function setItem(index, value) {
    onChange(values.map((item, itemIndex) => itemIndex === index ? value : item));
  }
  function remove(index) {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  }
  return (
    <section className="memory-list-editor">
      <header><span>{label}</span><button type="button" onClick={() => onChange([...values, ''])}>+ Add</button></header>
      {values.length ? values.map((item, index) => (
        <div className="memory-list-row" key={`${label}-${index}`}>
          <textarea value={item} onChange={(event) => setItem(index, event.target.value)} placeholder={placeholder} />
          <button type="button" onClick={() => remove(index)} aria-label={`Remove ${label} item`}>×</button>
        </div>
      )) : <p className="memory-muted">Nothing captured yet.</p>}
    </section>
  );
}

function ActionItemsEditor({ items, onChange }) {
  function setItem(index, key, value) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }
  function remove(index) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }
  return (
    <section className="memory-list-editor">
      <header><span>Action items</span><button type="button" onClick={() => onChange([...items, { task: '', owner: '', dueAt: '' }])}>+ Add</button></header>
      {items.length ? items.map((item, index) => (
        <div className="memory-action-row" key={`action-${index}`}>
          <textarea value={item.task} onChange={(event) => setItem(index, 'task', event.target.value)} placeholder="Concrete action" />
          <input value={item.owner} onChange={(event) => setItem(index, 'owner', event.target.value)} placeholder="Owner if known" />
          <input value={item.dueAt} onChange={(event) => setItem(index, 'dueAt', event.target.value)} placeholder="Deadline if known" />
          <button type="button" onClick={() => remove(index)} aria-label="Remove action item">×</button>
        </div>
      )) : <p className="memory-muted">No action items captured yet.</p>}
    </section>
  );
}

export function Stage7Launcher() {
  return <a className="stage7-launcher" href="/memory"><span>◎</span>Meeting memory</a>;
}

export default function Stage7Memory() {
  const [memories, setMemories] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      window.location.replace('/login');
      return;
    }

    axios.get(`${API_URL}/api/meetings/memory-state`, { headers: authHeaders() })
      .then((response) => {
        const next = response.data.memories || [];
        setMemories(next);
        setDrafts(Object.fromEntries(next.map((memory) => [memory.meetingId, draftFromMemory(memory)])));
        setSelectedId(next[0]?.meetingId || null);
      })
      .catch((error) => setMessage(error.response?.data?.error || 'Could not load meeting memory'))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => memories.find((item) => item.meetingId === selectedId) || null, [memories, selectedId]);
  const draft = selected ? (drafts[selected.meetingId] || draftFromMemory(selected)) : null;
  const relationshipHistory = useMemo(() => {
    if (!selected) return [];
    return memories
      .filter((item) => item.attendeeEmail === selected.attendeeEmail && item.meetingId !== selected.meetingId)
      .sort((left, right) => new Date(right.selectedSlot || 0) - new Date(left.selectedSlot || 0));
  }, [memories, selected]);

  function setDraft(key, value) {
    if (!selected) return;
    setDrafts((current) => ({
      ...current,
      [selected.meetingId]: { ...(current[selected.meetingId] || draftFromMemory(selected)), [key]: value },
    }));
  }

  async function generateMemory() {
    if (!selected || !draft?.notes.trim()) {
      setMessage('Capture the meeting notes first. CallSync only generates memory from notes you actually provide.');
      return;
    }
    setGeneratingId(selected.meetingId);
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'meeting_memory',
        meetingId: selected.meetingId,
        context: { notes: draft.notes },
      }, { headers: authHeaders() });
      const output = response.data.output || {};
      setDrafts((current) => ({
        ...current,
        [selected.meetingId]: {
          ...current[selected.meetingId],
          summary: output.summary || '',
          keyPoints: output.keyPoints || [],
          decisions: output.decisions || [],
          actionItems: output.actionItems || [],
          unansweredQuestions: output.unansweredQuestions || [],
        },
      }));
      setMessage('Meeting memory refreshed from the captured notes. Review and edit it before saving.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not generate meeting memory');
    } finally {
      setGeneratingId(null);
    }
  }

  async function saveMemory() {
    if (!selected || !draft) return;
    setSavingId(selected.meetingId);
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/meetings/${selected.meetingId}/memory`, draft, { headers: authHeaders() });
      const saved = response.data.memory;
      setMemories((current) => current.map((item) => item.meetingId === saved.meetingId ? saved : item));
      setDrafts((current) => ({ ...current, [saved.meetingId]: draftFromMemory(saved) }));
      setMessage('Meeting memory saved to the CallSync record.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not save meeting memory');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="memory-screen">
      <header className="memory-topbar">
        <a className="memory-brand" href="/"><span>CS</span>CallSync</a>
        <nav><a href="/dashboard">Pipeline</a><a href="/prepare">Prepare & outcomes</a></nav>
      </header>

      <section className="memory-shell">
        <aside className="memory-sidebar">
          <div className="memory-sidebar-head">
            <p>Meeting memory</p>
            <h1>What happened, what matters, what comes next.</h1>
          </div>
          {loading && <p className="memory-muted">Loading booked meetings…</p>}
          {!loading && !memories.length && <p className="memory-muted">Book a meeting first. Completed meeting records will live here.</p>}
          <div className="memory-meeting-list">
            {memories.map((memory) => (
              <button type="button" className={memory.meetingId === selectedId ? 'active' : ''} key={memory.meetingId} onClick={() => setSelectedId(memory.meetingId)}>
                <small>{formatDateTime(memory.selectedSlot)}</small>
                <strong>{memory.attendeeName}</strong>
                <span>{memory.meetingType}</span>
                {memory.memoryUpdatedAt && <em>Memory saved</em>}
              </button>
            ))}
          </div>
        </aside>

        <section className="memory-main">
          {!selected && !loading && <div className="memory-empty">No booked meeting selected.</div>}
          {selected && draft && (
            <>
              <header className="memory-record-head">
                <div><p>{selected.meetingType}</p><h2>{selected.attendeeName}</h2><span>{selected.attendeeEmail} · {formatDateTime(selected.selectedSlot)} · {selected.durationMinutes} min</span></div>
                <div className="memory-head-actions">
                  <button type="button" onClick={generateMemory} disabled={generatingId === selected.meetingId}>{generatingId === selected.meetingId ? 'Generating…' : 'Generate from notes'}</button>
                  <button className="primary" type="button" onClick={saveMemory} disabled={savingId === selected.meetingId}>{savingId === selected.meetingId ? 'Saving…' : 'Save memory'}</button>
                </div>
              </header>

              <div className="memory-continuity-grid">
                <section className="memory-context-card">
                  <small>Before the meeting</small>
                  <h3>Why it existed</h3>
                  <p>{selected.meetingGoal || selected.inviteMessage || 'No meeting goal was captured.'}</p>
                  {!!selected.guestAnswers?.length && <div className="memory-answer-list">{selected.guestAnswers.map((item, index) => <div key={`${item.question}-${index}`}><b>{item.question}</b><span>{item.answer || 'No answer provided'}</span></div>)}</div>}
                  {selected.internalNotes && <details><summary>Private prep notes</summary><p>{selected.internalNotes}</p></details>}
                </section>
                <section className="memory-context-card">
                  <small>Outcome</small>
                  <h3>What the workflow already knows</h3>
                  <p>{selected.outcomeNextStep || 'No next step has been recorded yet.'}</p>
                  {selected.outcomeNotes && <blockquote>{selected.outcomeNotes}</blockquote>}
                  <span>Useful: {selected.useful === null ? 'Not rated' : selected.useful ? 'Yes' : 'No'}</span>
                </section>
              </div>

              <section className="memory-notes-card">
                <div><small>Captured notes · source material</small><h3>Write what actually happened.</h3><p>These notes stay separate from the generated memory and remain the source of truth.</p></div>
                <textarea value={draft.notes} onChange={(event) => setDraft('notes', event.target.value)} placeholder="Capture discussion points, decisions, commitments, objections, open questions, and anything you want CallSync to remember." />
              </section>

              <section className="memory-structured-card">
                <label className="memory-summary-field"><span>Summary · editable</span><textarea value={draft.summary} onChange={(event) => setDraft('summary', event.target.value)} placeholder="Concise record of what was discussed and what matters next." /></label>
                <div className="memory-edit-grid">
                  <TextListEditor label="Key points" values={draft.keyPoints} onChange={(value) => setDraft('keyPoints', value)} placeholder="Important fact or context" />
                  <TextListEditor label="Decisions" values={draft.decisions} onChange={(value) => setDraft('decisions', value)} placeholder="Decision actually made" />
                </div>
                <ActionItemsEditor items={draft.actionItems} onChange={(value) => setDraft('actionItems', value)} />
                <TextListEditor label="Unanswered questions" values={draft.unansweredQuestions} onChange={(value) => setDraft('unansweredQuestions', value)} placeholder="Open question to carry forward" />
              </section>

              <section className="memory-history-card">
                <div><small>Relationship continuity</small><h3>Previous meetings with {selected.attendeeName}</h3></div>
                {relationshipHistory.length ? relationshipHistory.map((item) => (
                  <button type="button" key={item.meetingId} onClick={() => setSelectedId(item.meetingId)}>
                    <span>{formatDateTime(item.selectedSlot)}</span>
                    <strong>{item.memorySummary || item.summary || item.outcomeNextStep || item.meetingGoal || 'No memory captured yet.'}</strong>
                  </button>
                )) : <p className="memory-muted">This is the first booked meeting with this attendee in CallSync.</p>}
              </section>
            </>
          )}
          {message && <div className="memory-message">{message}</div>}
        </section>
      </section>
    </main>
  );
}
