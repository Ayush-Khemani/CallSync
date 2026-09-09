import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import { buildRelationships } from './relationshipWorkflow';
import './RelationshipsView.css';

export default function RelationshipsView() {
  const [relationships, setRelationships] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [meetingsResponse, outcomesResponse, memoriesResponse, actionsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/meetings/outcome-state`, { headers: authHeaders() }).catch(() => ({ data: { outcomes: [] } })),
        axios.get(`${API_URL}/api/meetings/memory-state`, { headers: authHeaders() }).catch(() => ({ data: { memories: [] } })),
        axios.get(`${API_URL}/api/actions?status=all`, { headers: authHeaders() }).catch(() => ({ data: { actions: [] } })),
      ]);

      setRelationships(buildRelationships(
        meetingsResponse.data.meetings || [],
        outcomesResponse.data.outcomes || [],
        memoriesResponse.data.memories || [],
        actionsResponse.data.actions || []
      ));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not load relationship history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return relationships;
    return relationships.filter((relationship) => [
      relationship.attendeeName,
      relationship.email,
      relationship.latestMeetingType,
      relationship.latestContext,
      relationship.nextAction?.title,
    ].some((value) => String(value || '').toLowerCase().includes(normalized)));
  }, [query, relationships]);

  return (
    <section className="pw-page relationships-page">
      <header className="pw-page-head compact relationships-head">
        <div><h1>People</h1></div>
      </header>

      <div className="relationships-toolbar">
        <label className="pw-search relationships-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" /></label>
      </div>

      {message && <div className="pw-message error">{message}</div>}
      {loading && !relationships.length ? <div className="pw-loading-card">Building relationship history…</div> : (
        <div className="relationships-list">
          {visible.map((relationship) => (
            <a className="relationship-row relationship-row-link" href={`/meeting/${relationship.latestMeetingId}`} key={relationship.email}>
              <div className="relationship-person">
                <div className="relationship-avatar">{(relationship.attendeeName || relationship.email).trim().slice(0, 1).toUpperCase()}</div>
                <div><h3>{relationship.attendeeName}</h3><p>{relationship.email} · {relationship.meetingCount} meeting{relationship.meetingCount === 1 ? '' : 's'}</p></div>
              </div>

              <div className="relationship-context">
                <span>Last conversation</span>
                <strong>{relationship.latestContext || relationship.latestMeetingType || 'Meeting'}</strong>
                <small>{relationship.latestMeetingType || 'Meeting'} · {relationship.lastContactAt ? formatShortDate(relationship.lastContactAt) : 'No date'}</small>
              </div>

              <div className="relationship-next">
                <span>Next</span>
                {relationship.nextAction ? <><strong>{relationship.nextAction.title}</strong><small>{relationship.nextAction.dueAt ? `Due ${formatShortDate(relationship.nextAction.dueAt)}` : 'No due date'}</small></> : <strong className="muted">Nothing open</strong>}
              </div>
            </a>
          ))}
          {!visible.length && <div className="relationships-empty">{relationships.length ? 'No relationships match this search.' : 'Relationship history will appear after you create meetings with people.'}</div>}
        </div>
      )}
    </section>
  );
}
