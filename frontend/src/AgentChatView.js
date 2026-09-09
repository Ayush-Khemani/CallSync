import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL, authHeaders, formatShortDate } from './workspaceShared';
import './AgentChatView.css';

const QUICK_PROMPTS = [
  'Schedule a 30 minute meeting next week',
  'Show my open tasks',
  'Show my meetings',
];

function nextId(prefix = 'message') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSchedulingRequest(text) {
  return /\b(schedule|book|arrange|set up|find (?:a )?time|send (?:an )?invite|create (?:a )?meeting)\b/i.test(text);
}

function isTaskRequest(text) {
  return /\b(tasks?|to-?dos?|commitments?|actions?)\b/i.test(text);
}

function isMeetingRequest(text) {
  return /\b(meetings?|calls?|upcoming|calendar)\b/i.test(text);
}

function missingScheduleFields(draft) {
  const form = draft?.formPatch || {};
  const missing = [];
  if (!form.attendeeName) missing.push('guest name');
  if (!form.attendeeEmail) missing.push('guest email');
  if (!form.selectedDate) missing.push('date');
  return missing;
}

function ScheduleProposal({ proposal, onToggleSlot, onConfirm, busy }) {
  const form = proposal.draft.formPatch;
  return (
    <div className="agent-result-card agent-schedule-card">
      <div className="agent-result-title">
        <div>
          <span>Ready to schedule</span>
          <strong>{form.attendeeName}</strong>
          <small>{form.attendeeEmail}</small>
        </div>
        <b>{form.durationMinutes} min</b>
      </div>

      <div className="agent-result-meta">
        <span>{form.selectedDate}</span>
        <span>{proposal.timeZone}</span>
      </div>

      <div className="agent-slot-list">
        {proposal.slots.map((slot) => {
          const selected = proposal.selectedSlots.includes(slot);
          return (
            <button type="button" className={selected ? 'selected' : ''} key={slot} onClick={() => onToggleSlot(slot)}>
              <span>{new Date(slot).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <strong>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            </button>
          );
        })}
      </div>

      <div className="agent-confirm-row">
        <div>
          <strong>{proposal.selectedSlots.length} time{proposal.selectedSlots.length === 1 ? '' : 's'} selected</strong>
          <span>CallSync will place calendar holds and send the request.</span>
        </div>
        <button type="button" onClick={onConfirm} disabled={!proposal.selectedSlots.length || busy}>
          {busy ? 'Sending…' : 'Send meeting request'}
        </button>
      </div>
    </div>
  );
}

function MeetingList({ items }) {
  if (!items.length) return <div className="agent-empty-result">You do not have any active meetings yet.</div>;
  return (
    <div className="agent-result-list">
      {items.map((meeting) => (
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
  if (!items.length) return <div className="agent-empty-result">You have no open tasks.</div>;
  return (
    <div className="agent-result-list">
      {items.map((task) => (
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

export default function AgentChatView() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState('');
  const [scheduleContext, setScheduleContext] = useState('');
  const [proposal, setProposal] = useState(null);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  function addMessage(message) {
    setMessages((current) => [...current, { id: nextId(), ...message }]);
  }

  async function prepareSchedule(text) {
    const combinedPrompt = scheduleContext
      ? `${scheduleContext}\nUpdate from user: ${text}`
      : text;

    setBusy('schedule');
    try {
      const response = await axios.post(`${API_URL}/api/intelligence/generate`, {
        kind: 'meeting_brief',
        context: { prompt: combinedPrompt },
      }, { headers: authHeaders() });

      const draft = response.data.output || {};
      const missing = missingScheduleFields(draft);
      setScheduleContext(combinedPrompt);

      if (missing.length) {
        setProposal(null);
        addMessage({
          role: 'assistant',
          text: `I can set that up. I still need the ${missing.join(' and ')}. Send that here and I’ll continue.`,
        });
        return;
      }

      const form = draft.formPatch;
      const availability = await axios.get(`${API_URL}/api/calendar/available-slots`, {
        params: {
          date: form.selectedDate,
          workStartHour: form.workStartHour,
          workEndHour: form.workEndHour,
          durationMinutes: form.durationMinutes,
          slotIntervalMinutes: form.slotIntervalMinutes,
          bufferMinutes: form.bufferMinutes,
          timeZone,
        },
        headers: authHeaders(),
      });

      const slots = (availability.data.availableSlots || []).slice(0, 4);
      if (!slots.length) {
        setProposal(null);
        addMessage({
          role: 'assistant',
          text: `I understood the meeting, but I couldn’t find an available ${form.durationMinutes}-minute window on ${form.selectedDate}. Tell me another day or time window and I’ll check again.`,
        });
        return;
      }

      const nextProposal = {
        draft,
        slots,
        selectedSlots: slots.slice(0, Math.min(3, slots.length)),
        timeZone: availability.data.timeZone || timeZone,
      };
      setProposal(nextProposal);
      addMessage({
        role: 'assistant',
        text: `I checked your connected calendars and found ${slots.length} available option${slots.length === 1 ? '' : 's'}. I selected the best few below. Nothing will be sent until you confirm.`,
        type: 'schedule-proposal',
      });
    } catch (error) {
      addMessage({
        role: 'assistant',
        text: error.response?.data?.error || 'I could not prepare that meeting. Check your calendar connection and try again.',
      });
    } finally {
      setBusy('');
    }
  }

  async function showTasks() {
    setBusy('read');
    try {
      const response = await axios.get(`${API_URL}/api/actions?status=open`, { headers: authHeaders() });
      addMessage({
        role: 'assistant',
        text: response.data.actions?.length ? 'These are your open meeting tasks.' : 'You are caught up.',
        type: 'tasks',
        items: (response.data.actions || []).slice(0, 8),
      });
    } catch (error) {
      addMessage({ role: 'assistant', text: error.response?.data?.error || 'I could not load your tasks.' });
    } finally {
      setBusy('');
    }
  }

  async function showMeetings() {
    setBusy('read');
    try {
      const response = await axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() });
      const items = (response.data.meetings || [])
        .filter((meeting) => meeting.status !== 'cancelled')
        .sort((a, b) => {
          if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
          if (a.status !== 'confirmed' && b.status === 'confirmed') return 1;
          return new Date(a.selectedSlot || a.createdAt).getTime() - new Date(b.selectedSlot || b.createdAt).getTime();
        })
        .slice(0, 8);
      addMessage({
        role: 'assistant',
        text: items.length ? 'Here are your active meetings.' : 'You do not have any active meetings yet.',
        type: 'meetings',
        items,
      });
    } catch (error) {
      addMessage({ role: 'assistant', text: error.response?.data?.error || 'I could not load your meetings.' });
    } finally {
      setBusy('');
    }
  }

  async function handleUserText(rawText) {
    const text = rawText.trim();
    if (!text || busy) return;

    addMessage({ role: 'user', text });
    setInput('');

    if (proposal || scheduleContext || isSchedulingRequest(text)) {
      await prepareSchedule(text);
      return;
    }
    if (isTaskRequest(text)) {
      await showTasks();
      return;
    }
    if (isMeetingRequest(text)) {
      await showMeetings();
      return;
    }

    addMessage({
      role: 'assistant',
      text: 'I can already schedule meetings, check your active meetings, and show your open tasks. Try telling me what you want done in plain language.',
    });
  }

  function toggleSlot(slot) {
    setProposal((current) => {
      if (!current) return current;
      const selectedSlots = current.selectedSlots.includes(slot)
        ? current.selectedSlots.filter((item) => item !== slot)
        : [...current.selectedSlots, slot];
      return { ...current, selectedSlots };
    });
  }

  async function confirmSchedule() {
    if (!proposal?.selectedSlots.length || busy) return;
    setBusy('confirm');
    try {
      const form = proposal.draft.formPatch;
      const brief = proposal.draft.brief || {};
      const response = await axios.post(`${API_URL}/api/meetings/create`, {
        attendeeEmail: form.attendeeEmail,
        attendeeName: form.attendeeName,
        slots: proposal.selectedSlots,
        durationMinutes: form.durationMinutes,
        brief: {
          type: brief.type || 'Meeting',
          goal: brief.goal || '',
          message: brief.message || '',
          questions: brief.questions || [],
          internalNotes: '',
        },
      }, { headers: authHeaders() });

      const bookingUrl = `${window.location.origin}/select-slot/${response.data.uniqueLink}`;
      const sent = Boolean(response.data.delivery?.requestEmail?.sent);
      addMessage({
        role: 'assistant',
        text: sent
          ? `Done. I created the meeting with ${form.attendeeName}, protected the offered times on your connected calendars, and sent the request.`
          : `The meeting is created and the calendar holds are protected, but email delivery was not confirmed. You can send the booking link manually.`,
        type: 'created',
        bookingUrl,
        meetingName: form.attendeeName,
        sent,
      });
      setProposal(null);
      setScheduleContext('');
    } catch (error) {
      addMessage({
        role: 'assistant',
        text: error.response?.data?.error || 'I could not create the meeting request, so nothing was sent.',
      });
    } finally {
      setBusy('');
    }
  }

  function submit(event) {
    event.preventDefault();
    handleUserText(input);
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
            <p>Describe the outcome. CallSync will handle the workflow and ask before it sends or changes anything important.</p>
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
                {message.type === 'schedule-proposal' && proposal && (
                  <ScheduleProposal proposal={proposal} onToggleSlot={toggleSlot} onConfirm={confirmSchedule} busy={busy === 'confirm'} />
                )}
                {message.type === 'meetings' && <MeetingList items={message.items || []} />}
                {message.type === 'tasks' && <TaskList items={message.items || []} />}
                {message.type === 'created' && (
                  <div className="agent-created-result">
                    <div><span>{message.sent ? 'Request sent' : 'Meeting created'}</span><strong>{message.meetingName}</strong></div>
                    <a href={message.bookingUrl} target="_blank" rel="noreferrer">Open booking page</a>
                  </div>
                )}
              </article>
            ))}
            {!!busy && busy !== 'confirm' && <div className="agent-thinking"><span /><span /><span /></div>}
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
            placeholder={proposal ? 'Change anything, or confirm the request above…' : 'Tell CallSync what you want done…'}
            rows="1"
          />
          <button type="submit" disabled={!input.trim() || Boolean(busy)} aria-label="Send message">↑</button>
        </form>
        <span className="agent-composer-note">CallSync asks before sending messages or changing external systems.</span>
      </div>
    </section>
  );
}
