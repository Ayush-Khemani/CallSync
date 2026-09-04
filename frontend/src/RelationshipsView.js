import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import { buildRelationships } from './relationshipWorkflow';
import './RelationshipsView.css';

function stateLabel(value) {
  if (value === 'active') return 'Active';
  if (value === 'recent') return 'Recent';
  return 'History';
}

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

  const activeCount = relationships.filter((item) => item.relationshipState === 'active').length;
  const repeatedCount = relationships.filter((item) => item.meetingCount > 1).length;
  const openActions = relationships.reduce((sum, item) => sum + item.openActionCount, 0);

  return (
    <section className="pw-page relationships-page">
      <header className="pw-page-head compact relationships-head">
        <div>
          <p className="pw-kicker">Relationships</p>
          <h1>The history behind the next conversation.</h1>
          <p>CallSync groups repeated meetings by person so context, commitments, and momentum survive beyond a single calendar event.</p>
        </div>
      </header>

      <div className="relationships-summary">
        <article><span>People</span><strong>{relationships.length}</strong><small>Meeting relationships</small></article>
        <article><span>Active</span><strong>{activeCount}</strong><small>Waiting or carrying open work</small></article>
        <article><span>Repeated</span><strong>{repeatedCount}</strong><small>More than one meeting</small></article>
        <article><span>Open actions</span><strong>{openActions}</strong><small>Commitments across relationships</small></article>
      </div>

      <div className="relationships-toolbar">
        <label className="pw-search relationships-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search person, email, meeting type or context" /></label>
        <button className="pw-secondary-button" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && <div className="pw-message error">{message}</div>}
      {loading && !relationships.length ? <div className="pw-loading-card">Building relationship history…</div> : (
        <div className="relationships-list">
          {visible.map((relationship) => (
            <article className="relationship-row" key={relationship.email}>
              <div className="relationship-person">
                <div className="relationship-avatar">{(relationship.attendeeName || relationship.email).trim().slice(0, 1).toUpperCase()}</div>
                <div><div className="relationship-name-line"><h3>{relationship.attendeeName}</h3><span className={`relationship-state state-${relationship.relationshipState}`}>{stateLabel(relationship.relationshipState)}</span></div><p>{relationship.email}</p></div>
              </div>

              <div className="relationship-context">
                <span>Latest context</span>
                <strong>{relationship.latestContext || 'No outcome or saved memory yet.'}</strong>
                <small>{relationship.latestMeetingType} · {relationship.lastContactAt ? formatShortDate(relationship.lastContactAt) : 'No dated meeting'}</small>
              </div>

              <div className="relationship-signals">
                <div><span>Meetings</span><strong>{relationship.meetingCount}</strong></div>
                <div><span>Open actions</span><strong>{relationship.openActionCount}</strong></div>
              </div>

              <div className="relationship-next">
                <span>Next commitment</span>
                {relationship.nextAction ? <><strong>{relationship.nextAction.title}</strong><small>{relationship.nextAction.dueAt ? `Due ${formatShortDate(relationship.nextAction.dueAt)}` : 'No due date'}</small></> : <strong className="muted">Nothing open</strong>}
              </div>

              <a className="relationship-open" href={`/meeting/${relationship.latestMeetingId}`}>Open latest meeting →</a>
            </article>
          ))}
          {!visible.length && <div className="relationships-empty">{relationships.length ? 'No relationships match this search.' : 'Relationship history will appear after you create meetings with people.'}</div>}
        </div>
      )}
    </section>
  );
}
