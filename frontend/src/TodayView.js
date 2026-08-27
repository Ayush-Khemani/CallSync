import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import { buildTodayWorkspace, todayAttentionCount } from './todayWorkflow';
import './TodayView.css';

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

function Section({ title, count, empty, children }) {
  return (
    <section className="today-section">
      <header><div><h2>{title}</h2><span>{count}</span></div></header>
      {count ? <div className="today-list">{children}</div> : <div className="today-empty">{empty}</div>}
    </section>
  );
}

export default function TodayView({ onCreate, onPipeline }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, followUpResponse, outcomeResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }).catch(() => ({ data: { followUps: [] } })),
        axios.get(`${API_URL}/api/meetings/outcome-state`, { headers: authHeaders() }).catch(() => ({ data: { outcomes: [] } })),
      ]);

      const followUpById = new Map((followUpResponse.data.followUps || []).map((item) => [item.meetingId, item]));
      const outcomeById = new Map((outcomeResponse.data.outcomes || []).map((item) => [item.meetingId, item]));
      setMeetings((meetingsResponse.data.meetings || []).map((meeting) => ({
        ...meeting,
        ...(followUpById.get(meeting.id) || {}),
        ...(outcomeById.get(meeting.id) || {}),
      })));
      setNow(Date.now());
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load today’s meeting work.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const workspace = useMemo(() => buildTodayWorkspace(meetings, now), [meetings, now]);
  const attentionCount = todayAttentionCount(workspace);
  const firstUpcoming = workspace.upcoming[0] || null;

  return (
    <section className="pw-page today-page">
      <header className="pw-page-head today-head">
        <div>
          <p className="pw-kicker">Today</p>
          <h1>What needs your attention?</h1>
          <p>CallSync turns the meeting lifecycle into a short working queue: prepare, follow up, capture outcomes, and keep momentum moving.</p>
        </div>
        <button className="pw-primary-button" type="button" onClick={onCreate}>+ New meeting</button>
      </header>

      <div className="today-summary">
        <article>
          <span>Needs action</span>
          <strong>{attentionCount}</strong>
          <small>Follow-ups, outcomes and due next steps</small>
        </article>
        <article>
          <span>Next 24 hours</span>
          <strong>{workspace.upcoming.length}</strong>
          <small>{firstUpcoming ? `Next: ${firstUpcoming.attendeeName || firstUpcoming.attendeeEmail}` : 'No booked meetings coming up'}</small>
        </article>
        <article>
          <span>Waiting for booking</span>
          <strong>{workspace.waiting.length}</strong>
          <small>Open meeting requests</small>
        </article>
      </div>

      {message && <div className="pw-message error">{message}</div>}
      {loading && !meetings.length && <div className="pw-loading-card">Building your daily meeting queue…</div>}

      {!loading && (
        <div className="today-layout">
          <div className="today-primary">
            <Section title="Next up" count={workspace.upcoming.length} empty="Nothing booked in the next 24 hours.">
              {workspace.upcoming.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} eyebrow="Upcoming meeting" detail={formatShortDate(meeting.selectedSlot)} action="Prepare" />
              ))}
            </Section>

            <Section title="Needs action" count={attentionCount} empty="You are caught up. No follow-ups, overdue outcomes or next actions need attention.">
              {workspace.actions.map((meeting) => (
                <MeetingRow key={`action-${meeting.id}`} meeting={meeting} eyebrow="Next action due" detail={meeting.followUpAt ? formatShortDate(meeting.followUpAt) : 'Due now'} action="Handle action" />
              ))}
              {workspace.outcomes.map((meeting) => (
                <MeetingRow key={`outcome-${meeting.id}`} meeting={meeting} eyebrow="Outcome missing" detail={formatShortDate(meeting.selectedSlot)} action="Capture outcome" />
              ))}
              {workspace.followUp.map((meeting) => (
                <MeetingRow key={`followup-${meeting.id}`} meeting={meeting} eyebrow="Booking follow-up" detail={meeting.nextFollowUpAt ? formatShortDate(meeting.nextFollowUpAt) : 'Needs a nudge'} action="Follow up" />
              ))}
            </Section>
          </div>

          <aside className="today-secondary">
            <Section title="Waiting" count={workspace.waiting.length} empty="No open booking requests are waiting on guests.">
              {workspace.waiting.slice(0, 6).map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} eyebrow="Link sent" detail={formatShortDate(meeting.createdAt)} />
              ))}
            </Section>
            {workspace.waiting.length > 6 && <button className="today-pipeline-link" type="button" onClick={onPipeline}>View all in Pipeline →</button>}
          </aside>
        </div>
      )}
    </section>
  );
}
