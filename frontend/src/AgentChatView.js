import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import './AgentChatView.css';

const QUICK_PROMPTS = [
  'Schedule a 30 minute meeting next week',
  'Prepare me for my next meeting',
  'What do I still owe people?',
  'Show my active meetings',
];

function nextId(prefix = 'message') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(message) {
  return {
    id: message.id || nextId(),
    role: message.role || 'assistant',
    text: message.content ?? message.text ?? '',
    payload: message.payload || {},
    createdAt: message.createdAt,
  };
}

function ScheduleProposal({ actionId, proposal, onConfirm, busy, completed }) {
  const [selectedSlots, setSelectedSlots] = useState(proposal.selectedSlots || []);

  function toggle(slot) {
    if (completed || busy) return;
    setSelectedSlots((current) => (
      current.includes(slot)
        ? current.filter((item) => item !== slot)
        : [...current, slot]
    ));
  }

  return (
    <div className="agent-result-card agent-schedule-card">
      <div className="agent-result-title">
        <div>
          <span>{completed ? 'Request handled' : 'Ready to schedule'}</span>
          <strong>{proposal.attendeeName}</strong>
          <small>{proposal.attendeeEmail}</small>
        </div>
        <b>{proposal.durationMinutes} min</b>
      </div>

      <div className="agent-result-meta">
        <span>{proposal.date}</span>
        <span>{proposal.timeZone}</span>
      </div>

      <div className="agent-slot-list">
        {(proposal.slots || []).map((slot) => {
          const selected = selectedSlots.includes(slot);
          return (
            <button
              type="button"
              className={selected ? 'selected' : ''}
              key={slot}
              onClick={() => toggle(slot)}
              disabled={completed}
            >
              <span>{new Date(slot).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <strong>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            </button>
          );
        })}
      </div>

      <div className="agent-confirm-row">
        <div>
          <strong>{selectedSlots.length} time{selectedSlots.length === 1 ? '' : 's'} selected</strong>
          <span>{completed ? 'This action has already been confirmed.' : 'CallSync will place calendar holds and send the request.'}</span>
        </div>
        <button
          type="button"
          onClick={() => onConfirm(actionId, selectedSlots)}
          disabled={completed || !selectedSlots.length || busy}
        >
          {completed ? 'Sent' : busy ? 'Sending…' : 'Send meeting request'}
        </button>
      </div>
    </div>
  );
}

function MeetingList({ items }) {
  if (!items.length) return <div className="agent-empty-result">No matching meetings.</div>;
  return (
    <div className="agent-result-list">
      {items.slice(0, 10).map((meeting) => (
        <a href={`/meeting/${meeting.id}`} key={meeting.id}>
          <div>
            <strong>{meeting.attendeeName || meeting.attendeeEmail || 'Meeting'}</strong>
            <span>{meeting.meetingType || 'Meeting'}</span>
          </div>
          <small>{meeting.status === 'confirmed' ? formatShortDate(meeting.selectedSlot) : 'Waiting for booking'}</small>
        </a>
      ))}
    </div>
  );
}

function TaskList({ items }) {
  if (!items.length) return <div className="agent-empty-result">No open tasks.</div>;
  return (
    <div className="agent-result-list">
      {items.slice(0, 10).map((task) => (
        <a href={`/meeting/${task.meetingId}`} key={task.actionId}>
          <div>
            <strong>{task.title}</strong>
            <span>{task.attendeeName || task.attendeeEmail || 'Meeting'}</span>
          </div>
          <small>{task.dueAt ? formatShortDate(task.dueAt) : 'No due date'}</small>
        </a>
      ))}
    </div>
  );
}

function PersonResult({ payload }) {
  if (!payload.found) return <div className="agent-empty-result">No matching person in your meeting history.</div>;
  return (
    <div className="agent-person-result">
      <div className="agent-person-head">
        <div><strong>{payload.person?.name || payload.person?.email}</strong><span>{payload.person?.email}</span></div>
        <b>{payload.meetings?.length || 0} meetings</b>
      </div>
      <MeetingList items={payload.meetings || []} />
      {!!payload.openTasks?.length && <TaskList items={payload.openTasks.map((task) => ({ ...task, attendeeName: payload.person?.name }))} />}
    </div>
  );
}

function PreCallResult({ payload }) {
  const brief = payload.brief || {};
  const meeting = payload.meeting || {};
  return (
    <div className="agent-result-card agent-precall-card">
      <div className="agent-result-title">
        <div><span>Meeting prep</span><strong>{meeting.attendeeName || meeting.attendeeEmail || 'Meeting'}</strong></div>
        <b>{meeting.durationMinutes || 60} min</b>
      </div>
      {brief.goal && <p className="agent-precall-goal">{brief.goal}</p>}
      {!!brief.agenda?.length && (
        <ol className="agent-precall-agenda">
          {brief.agenda.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ol>
      )}
      {brief.openingPrompt && <div className="agent-opening"><span>Open with</span><strong>{brief.openingPrompt}</strong></div>}
    </div>
  );
}

function CreatedResult({ payload }) {
  const bookingUrl = payload.uniqueLink ? `${window.location.origin}/select-slot/${payload.uniqueLink}` : '';
  return (
    <div className="agent-created-result">
      <div><span>{payload.sent ? 'Request sent' : 'Meeting created'}</span><strong>{payload.meetingName || 'Meeting'}</strong></div>
      {bookingUrl && <a href={bookingUrl} target="_blank" rel="noreferrer">Open booking page</a>}
    </div>
  );
}

export default function AgentChatView() {
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmedActions, setConfirmedActions] = useState(new Set());

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/agent/threads/latest`, { headers: authHeaders() })
      .then((response) => {
        if (cancelled) return;
        const restored = (response.data.messages || []).map(normalizeMessage);
        setThreadId(response.data.thread?.id || '');
        setMessages(restored);
        setConfirmedActions(new Set(
          restored
            .filter((message) => message.payload?.type === 'created' && message.payload?.actionId)
            .map((message) => message.payload.actionId)
        ));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function handleUserText(rawText) {
    const text = rawText.trim();
    if (!text || busy) return;

    const optimistic = normalizeMessage({ role: 'user', text, id: nextId('user') });
    setMessages((current) => [...current, optimistic]);
    setInput('');
    setBusy('chat');

    try {
      const response = await axios.post(`${API_URL}/api/agent/chat`, {
        threadId: threadId || null,
        message: text,
        timeZone,
      }, { headers: authHeaders() });

      setThreadId(response.data.thread?.id || threadId);
      setMessages((current) => [...current, normalizeMessage(response.data.message)]);
    } catch (error) {
      setMessages((current) => [...current, normalizeMessage({
        role: 'assistant',
        text: error.response?.data?.error || 'CallSync could not complete that request.',
      })]);
    } finally {
      setBusy('');
    }
  }

  async function confirmAction(actionId, selectedSlots) {
    if (!actionId || busy) return;
    setBusy(actionId);
    try {
      const response = await axios.post(
        `${API_URL}/api/agent/actions/${actionId}/confirm`,
        { selectedSlots },
        { headers: authHeaders() }
      );
      setConfirmedActions((current) => new Set([...current, actionId]));
      setMessages((current) => [...current, normalizeMessage(response.data.message)]);
    } catch (error) {
      setMessages((current) => [...current, normalizeMessage({
        role: 'assistant',
        text: error.response?.data?.error || 'I could not complete that action, so I did not claim it succeeded.',
      })]);
    } finally {
      setBusy('');
    }
  }

  function submit(event) {
    event.preventDefault();
    handleUserText(input);
  }

  function renderPayload(message) {
    const payload = message.payload || {};
    if (payload.type === 'schedule_confirmation' && payload.proposal) {
      return (
        <ScheduleProposal
          actionId={payload.actionId}
          proposal={payload.proposal}
          onConfirm={confirmAction}
          busy={busy === payload.actionId}
          completed={confirmedActions.has(payload.actionId)}
        />
      );
    }
    if (payload.type === 'meetings') return <MeetingList items={payload.items || []} />;
    if (payload.type === 'tasks') return <TaskList items={payload.items || []} />;
    if (payload.type === 'person') return <PersonResult payload={payload} />;
    if (payload.type === 'pre_call') return <PreCallResult payload={payload} />;
    if (payload.type === 'created') return <CreatedResult payload={payload} />;
    return null;
  }

  return (
    <section className="agent-chat-page">
      <header className="agent-chat-top">
        <div>
          <strong>CallSync</strong>
          <span>AI workspace</span>
        </div>
      </header>

      <div className="agent-conversation">
        {!messages.length ? (
          <div className="agent-empty-home">
            <div className="agent-mark">CS</div>
            <h1>What do you want CallSync to do?</h1>
            <p>Describe the outcome. The agent can inspect your workspace, prepare work, and ask before it changes anything external.</p>
            <div className="agent-suggestions">
              {QUICK_PROMPTS.map((prompt) => (
                <button type="button" key={prompt} onClick={() => handleUserText(prompt)}>{prompt}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="agent-message-stream">
            {messages.map((message) => (
              <article className={`agent-message ${message.role}`} key={message.id}>
                <div className="agent-message-body">{message.text}</div>
                {renderPayload(message)}
              </article>
            ))}
            {!!busy && busy === 'chat' && <div className="agent-thinking"><span /><span /><span /></div>}
          </div>
        )}
      </div>

      <div className="agent-composer-wrap">
        <form className="agent-composer" onSubmit={submit}>
          <textarea
            aria-label="Ask CallSync"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (input.trim()) handleUserText(input);
              }
            }}
            placeholder="Tell CallSync what you want done…"
            rows="1"
          />
          <button type="submit" disabled={!input.trim() || Boolean(busy)} aria-label="Send message">↑</button>
        </form>
        <span className="agent-composer-note">CallSync can read and prepare freely. External changes still require confirmation.</span>
      </div>
    </section>
  );
}
