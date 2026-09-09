import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getFollowUpRisk, getMeetingPipelineStages, needsFollowUp } from './followUpWorkflow';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';

export default function PipelineView({ onCreate }) {
  const [meetings, setMeetings] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, followUpResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/follow-up-state`, { headers: authHeaders() }).catch(() => ({ data: { followUps: [] } })),
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
  const followUpDue = meetings.filter(needsFollowUp).length;

  return (
    <section className="pw-page pw-pipeline-page">
      <header className="pw-page-head">
        <div><h1>Meetings</h1></div>
        <button className="pw-primary-button" type="button" onClick={onCreate}>New meeting</button>
      </header>

      <div className="pw-board-toolbar meetings-toolbar">
        <label className="pw-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings" />
        </label>
        {!!followUpDue && <span className="meetings-attention">{followUpDue} need attention</span>}
      </div>

      {message && <div className="pw-message error">{message}</div>}
      {loading && !meetings.length && <div className="pw-loading-card">Loading your pipeline…</div>}

      {!loading && !meetings.length ? (
        <div className="pw-empty-state">
          <h2>No meetings yet</h2>
          <p>Create your first meeting to get started.</p>
          <button className="pw-primary-button" type="button" onClick={onCreate}>New meeting</button>
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
                        <span className="pw-type-chip">{meeting.meetingType || 'Meeting'}</span>
                      </div>
                      <h3>{meeting.attendeeName || 'Unnamed guest'}</h3>
                      <div className="pw-card-meta">
                        <span>{meeting.status === 'confirmed' ? 'Meeting time' : meeting.status === 'cancelled' ? 'Closed' : 'Created'}</span>
                        <strong>{meeting.status === 'confirmed' ? formatShortDate(meeting.selectedSlot) : formatShortDate(meeting.createdAt)}</strong>
                      </div>
                      {['medium', 'high'].includes(risk.level) && (
                        <div className={`pw-risk risk-${risk.level}`}><span>{risk.label}</span></div>
                      )}
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
