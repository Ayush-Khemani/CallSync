import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import { buildTodayWorkspace, todayAttentionCount } from './todayWorkflow';
import './TodayView.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function MeetingRow({ meeting, eyebrow, detail, action = 'Open meeting' }) {
  return (
    <a className="today-row" href={`/meeting/${meeting.id}`}>
      <div className="today-row-main">
        <span>{eyebrow}</span>
        <strong>{meeting.attendeeName || 'Unnamed guest'}</strong>
        <small>{meeting.meetingType || meeting.attendeeEmail || 'Meeting'}</small>
      </div>
      <div className="today-row-side">
        <span>{detail}</span>
        <b>{action} →</b>
      </div>
    </a>
  );
}

function ActionRow({ action, onComplete, busy }) {
  return (
    <div className="today-action-row">
      <a href={`/meeting/${action.meetingId}`}>
        <div className="today-row-main">
          <span>Meeting action</span>
          <strong>{action.title}</strong>
          <small>{action.attendeeName || action.attendeeEmail || 'Related meeting'}</small>
        </div>
        <div className="today-row-side">
          <span>{action.dueAt ? `Due ${formatShortDate(action.dueAt)}` : 'No due date'}</span>
          <b>Open meeting →</b>
        </div>
      </a>
      <button type="button" onClick={() => onComplete(action.actionId)} disabled={busy}>✓ Done</button>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="today-section">
      <header><div><h2>{title}</h2><span>{count}</span></div></header>
      <div className="today-list">{children}</div>
    </section>
  );
}

export default function TodayView({ onCreate, onPipeline }) {
  const [meetings, setMeetings] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyActionId, setBusyActionId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, followUpResponse, outcomeResponse, actionsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }).catch(() => ({ data: { followUps: [] } })),
        axios.get(`${API_URL}/api/meetings/outcome-state`, { headers: authHeaders() }).catch(() => ({ data: { outcomes: [] } })),
        axios.get(`${API_URL}/api/actions?status=open`, { headers: authHeaders() }).catch(() => ({ data: { actions: [] } })),
      ]);

      const followUpById = new Map((followUpResponse.data.followUps || []).map((item) => [item.meetingId, item]));
      const outcomeById = new Map((outcomeResponse.data.outcomes || []).map((item) => [item.meetingId, item]));
      setMeetings((meetingsResponse.data.meetings || []).map((meeting) => ({
        ...meeting,
        ...(followUpById.get(meeting.id) || {}),
        ...(outcomeById.get(meeting.id) || {}),
      })));
      setActions(actionsResponse.data.actions || []);
      setNow(Date.now());
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load today’s meeting work.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const workspace = useMemo(() => buildTodayWorkspace(meetings, now), [meetings, now]);
  const dueActions = useMemo(() => actions.filter((action) => {
    if (!action.dueAt) return true;
    const dueTime = new Date(action.dueAt).getTime();
    return !Number.isNaN(dueTime) && dueTime <= now + DAY_MS;
  }), [actions, now]);
  const attentionCount = todayAttentionCount(workspace, dueActions.length);
  const hasWork = attentionCount || workspace.upcoming.length || workspace.waiting.length;

  async function completeAction(actionId) {
    setBusyActionId(actionId);
    setMessage('');
    try {
      await axios.patch(`${API_URL}/api/actions/${actionId}`, { status: 'completed' }, { headers: authHeaders() });
      setActions((current) => current.filter((action) => action.actionId !== actionId));
      setMessage('Action completed.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not complete the action.');
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="pw-page today-page">
      <header className="pw-page-head today-head">
        <div>
          <h1>Today</h1>
        </div>
      </header>

      {message && <div className="pw-message success">{message}</div>}
      {loading && !meetings.length && <div className="pw-loading-card">Building your daily meeting queue…</div>}

      {!loading && (
        hasWork ? (
          <div className="today-primary">
            {!!attentionCount && (
              <Section title="Needs action" count={attentionCount}>
                {dueActions.map((action) => (
                  <ActionRow key={`action-${action.actionId}`} action={action} onComplete={completeAction} busy={busyActionId === action.actionId} />
                ))}
                {workspace.outcomes.map((meeting) => (
                  <MeetingRow key={`outcome-${meeting.id}`} meeting={meeting} eyebrow="Outcome" detail={formatShortDate(meeting.selectedSlot)} action="Capture" />
                ))}
                {workspace.followUp.map((meeting) => (
                  <MeetingRow key={`followup-${meeting.id}`} meeting={meeting} eyebrow="Follow-up" detail={meeting.nextFollowUpAt ? formatShortDate(meeting.nextFollowUpAt) : 'Due'} action="Send" />
                ))}
              </Section>
            )}

            {!!workspace.upcoming.length && (
              <Section title="Upcoming" count={workspace.upcoming.length}>
                {workspace.upcoming.map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} eyebrow="Upcoming" detail={formatShortDate(meeting.selectedSlot)} action="Prepare" />
                ))}
              </Section>
            )}

            {!!workspace.waiting.length && (
              <Section title="Waiting" count={workspace.waiting.length}>
                {workspace.waiting.slice(0, 6).map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} eyebrow="Sent" detail={formatShortDate(meeting.createdAt)} />
                ))}
              </Section>
            )}
            {workspace.waiting.length > 6 && <button className="today-pipeline-link" type="button" onClick={onPipeline}>View all meetings →</button>}
          </div>
        ) : (
          <div className="today-caught-up">
            <strong>You’re caught up.</strong>
            <span>No meetings or tasks need your attention right now.</span>
            <button type="button" onClick={onCreate}>Create a meeting</button>
          </div>
        )
      )}
    </section>
  );
}
