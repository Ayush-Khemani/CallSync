import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getFollowUpRisk, getMeetingPipelineStages, needsFollowUp } from './followUpWorkflow';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';

export default function PipelineView({ onCreate }) {
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
