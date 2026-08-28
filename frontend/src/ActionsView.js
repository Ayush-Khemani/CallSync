import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import './ActionsView.css';

function asTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function dueLabel(action, now) {
  if (!action.dueAt) return { label: 'No due date', state: 'undated' };
  const due = asTime(action.dueAt);
  if (!due) return { label: 'No due date', state: 'undated' };
  if (action.status === 'open' && due < now) return { label: `Overdue · ${formatShortDate(action.dueAt)}`, state: 'overdue' };
  return { label: formatShortDate(action.dueAt), state: 'scheduled' };
}

export default function ActionsView() {
  const [actions, setActions] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ meetingId: '', title: '', dueAt: '' });
  const now = Date.now();

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [actionsResponse, meetingsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/actions?status=all`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
      ]);
      setActions(actionsResponse.data.actions || []);
      setMeetings((meetingsResponse.data.meetings || []).filter((meeting) => meeting.status !== 'cancelled'));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load meeting actions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return actions;
    return actions.filter((action) => action.status === filter);
  }, [actions, filter]);

  const open = actions.filter((action) => action.status === 'open');
  const completed = actions.filter((action) => action.status === 'completed');
  const overdue = open.filter((action) => {
    const due = asTime(action.dueAt);
    return due !== null && due < now;
  });

  async function setStatus(action, status) {
    setBusyId(action.actionId);
    setMessage('');
    try {
      const response = await axios.patch(`${API_URL}/api/actions/${action.actionId}`, { status }, { headers: authHeaders() });
      const saved = response.data.action;
      setActions((current) => current.map((item) => item.actionId === saved.actionId ? { ...item, ...saved } : item));
      setMessage(status === 'completed' ? 'Action completed.' : 'Action reopened.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not update the action.');
    } finally {
      setBusyId(null);
    }
  }

  async function createAction(event) {
    event.preventDefault();
    if (!draft.meetingId || !draft.title.trim()) {
      setMessage('Choose a meeting and describe the action.');
      return;
    }

    setBusyId('create');
    setMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/meetings/${draft.meetingId}/actions`, {
        title: draft.title.trim(),
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      }, { headers: authHeaders() });
      const meeting = meetings.find((item) => String(item.id) === String(draft.meetingId));
      const created = {
        ...response.data.action,
        attendeeName: meeting?.attendeeName || '',
        attendeeEmail: meeting?.attendeeEmail || '',
        meetingType: meeting?.meetingType || '',
      };
      setActions((current) => [...current, created]);
      setDraft({ meetingId: '', title: '', dueAt: '' });
      setFilter('open');
      setMessage('Action added to the meeting.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not create the action.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="pw-page actions-page">
      <header className="pw-page-head compact actions-head">
        <div>
          <p className="pw-kicker">Meeting actions</p>
          <h1>Commitments should not disappear into notes.</h1>
          <p>Track what a conversation produced, when it is due, and which meeting it came from.</p>
        </div>
      </header>

      <div className="actions-summary">
        <article><span>Open</span><strong>{open.length}</strong><small>Active commitments</small></article>
        <article><span>Overdue</span><strong>{overdue.length}</strong><small>Need attention now</small></article>
        <article><span>Completed</span><strong>{completed.length}</strong><small>Closed commitments</small></article>
      </div>

      <form className="actions-create" onSubmit={createAction}>
        <div>
          <span className="mr-label">Add a commitment</span>
          <h2>Attach it to the conversation that created it.</h2>
        </div>
        <label>
          <span>Meeting</span>
          <select value={draft.meetingId} onChange={(event) => setDraft((current) => ({ ...current, meetingId: event.target.value }))}>
            <option value="">Choose meeting</option>
            {meetings.map((meeting) => <option value={meeting.id} key={meeting.id}>{meeting.attendeeName || meeting.attendeeEmail} · {meeting.meetingType || 'Meeting'}</option>)}
          </select>
        </label>
        <label className="actions-title-field">
          <span>Action</span>
          <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Send updated deck, share proposal, make introduction…" />
        </label>
        <label>
          <span>Due</span>
          <input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))} />
        </label>
        <button className="pw-primary-button" type="submit" disabled={busyId === 'create'}>{busyId === 'create' ? 'Adding…' : 'Add action'}</button>
      </form>

      {message && <div className="pw-message">{message}</div>}

      <div className="actions-toolbar">
        <div className="actions-filters">
          {['open', 'completed', 'all'].map((id) => <button type="button" key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{id === 'all' ? 'All' : id[0].toUpperCase() + id.slice(1)}</button>)}
        </div>
        <button className="pw-secondary-button" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {loading && !actions.length ? <div className="pw-loading-card">Loading meeting commitments…</div> : (
        <div className="actions-list">
          {visible.map((action) => {
            const due = dueLabel(action, now);
            return (
              <article className={`actions-item status-${action.status}`} key={action.actionId}>
                <div className="actions-check">
                  <button type="button" aria-label={action.status === 'open' ? `Complete ${action.title}` : `Reopen ${action.title}`} disabled={busyId === action.actionId} onClick={() => setStatus(action, action.status === 'open' ? 'completed' : 'open')}>{action.status === 'completed' ? '✓' : ''}</button>
                </div>
                <a className="actions-item-main" href={`/meeting/${action.meetingId}`}>
                  <div className="actions-item-meta"><span>{action.source === 'outcome' ? 'From meeting outcome' : 'Manual action'}</span><i>·</i><span>{action.attendeeName || action.attendeeEmail || 'Meeting'}</span></div>
                  <h3>{action.title}</h3>
                  <small>{action.meetingType || 'Meeting record'} · Open meeting →</small>
                </a>
                <div className={`actions-due ${due.state}`}><span>{due.state === 'overdue' ? 'Needs attention' : action.status === 'completed' ? 'Completed' : 'Due'}</span><strong>{action.status === 'completed' && action.completedAt ? formatShortDate(action.completedAt) : due.label}</strong></div>
              </article>
            );
          })}
          {!visible.length && <div className="actions-empty">{filter === 'open' ? 'No open commitments. New next steps from meeting outcomes will appear here automatically.' : `No ${filter} actions yet.`}</div>}
        </div>
      )}
    </section>
  );
}
