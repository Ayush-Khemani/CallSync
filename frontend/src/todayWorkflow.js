import { getMeetingNextAction } from './stage5Workflow';
import { getFollowUpRisk } from './followUpWorkflow';

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function buildTodayWorkspace(meetings, now = Date.now()) {
  const active = (meetings || []).filter((meeting) => meeting.status !== 'cancelled');
  const upcoming = [];
  const prepare = [];
  const waiting = [];
  const followUp = [];
  const outcomes = [];
  const actions = [];

  active.forEach((meeting) => {
    const selectedTime = timeOf(meeting.selectedSlot);
    const nextAction = getMeetingNextAction(meeting, now);

    if (meeting.status === 'pending') {
      waiting.push(meeting);
      const risk = getFollowUpRisk(meeting, now);
      if (risk.level === 'medium' || risk.level === 'high') followUp.push(meeting);
      return;
    }

    if (meeting.status !== 'confirmed') return;

    if (selectedTime && selectedTime >= now && selectedTime < now + DAY_MS) {
      upcoming.push(meeting);
      prepare.push(meeting);
    }

    if (nextAction.id === 'outcomeDue') outcomes.push(meeting);
    if (nextAction.id === 'nextAction') actions.push(meeting);
  });

  const byTime = (a, b) => (timeOf(a.selectedSlot) || Number.MAX_SAFE_INTEGER) - (timeOf(b.selectedSlot) || Number.MAX_SAFE_INTEGER);
  const byCreated = (a, b) => (timeOf(a.createdAt) || 0) - (timeOf(b.createdAt) || 0);
  const byFollowUp = (a, b) => (timeOf(a.followUpAt) || Number.MAX_SAFE_INTEGER) - (timeOf(b.followUpAt) || Number.MAX_SAFE_INTEGER);

  return {
    upcoming: upcoming.sort(byTime),
    prepare: prepare.sort(byTime),
    waiting: waiting.sort(byCreated),
    followUp: followUp.sort(byCreated),
    outcomes: outcomes.sort(byTime),
    actions: actions.sort(byFollowUp),
  };
}

export function todayAttentionCount(workspace) {
  return workspace.followUp.length + workspace.outcomes.length + workspace.actions.length;
}
