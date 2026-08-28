function timeOf(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function meetingTime(meeting) {
  return timeOf(meeting.selectedSlot) || timeOf(meeting.createdAt);
}

export function buildRelationships(meetings = [], outcomes = [], memories = [], actions = [], now = Date.now()) {
  const outcomeByMeeting = new Map(outcomes.map((item) => [item.meetingId, item]));
  const memoryByMeeting = new Map(memories.map((item) => [item.meetingId, item]));
  const actionsByMeeting = new Map();

  actions.filter((item) => item.status === 'open').forEach((action) => {
    const list = actionsByMeeting.get(action.meetingId) || [];
    list.push(action);
    actionsByMeeting.set(action.meetingId, list);
  });

  const groups = new Map();

  meetings.forEach((meeting) => {
    const email = normalizeEmail(meeting.attendeeEmail);
    if (!email || meeting.status === 'cancelled') return;

    const current = groups.get(email) || {
      email,
      attendeeName: meeting.attendeeName || '',
      meetings: [],
      openActions: [],
      pendingCount: 0,
      bookedCount: 0,
    };

    current.meetings.push(meeting);
    current.openActions.push(...(actionsByMeeting.get(meeting.id) || []));
    if (meeting.status === 'pending') current.pendingCount += 1;
    if (meeting.status === 'confirmed') current.bookedCount += 1;
    groups.set(email, current);
  });

  return [...groups.values()].map((group) => {
    group.meetings.sort((a, b) => meetingTime(b) - meetingTime(a));
    const latestMeeting = group.meetings[0];
    const latestOutcome = outcomeByMeeting.get(latestMeeting.id) || null;
    const latestMemory = memoryByMeeting.get(latestMeeting.id) || null;
    const sortedActions = [...group.openActions].sort((a, b) => {
      const aDue = timeOf(a.dueAt) || Number.MAX_SAFE_INTEGER;
      const bDue = timeOf(b.dueAt) || Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
    const nextAction = sortedActions[0] || null;
    const lastContactAt = latestMeeting.selectedSlot || latestMeeting.createdAt || null;
    const ageMs = lastContactAt ? Math.max(0, now - timeOf(lastContactAt)) : Number.MAX_SAFE_INTEGER;
    const relationshipState = sortedActions.length || group.pendingCount
      ? 'active'
      : ageMs <= 30 * 24 * 60 * 60 * 1000
        ? 'recent'
        : 'history';

    const latestContext = latestMemory?.summary
      || latestOutcome?.nextStep
      || latestMeeting.meetingGoal
      || latestMeeting.inviteMessage
      || '';

    return {
      email: group.email,
      attendeeName: latestMeeting.attendeeName || group.attendeeName || group.email,
      meetingCount: group.meetings.length,
      bookedCount: group.bookedCount,
      pendingCount: group.pendingCount,
      openActionCount: sortedActions.length,
      nextAction,
      latestMeetingId: latestMeeting.id,
      latestMeetingType: latestMeeting.meetingType || 'Meeting',
      latestStatus: latestMeeting.status,
      lastContactAt,
      latestContext,
      relationshipState,
    };
  }).sort((a, b) => {
    const stateRank = { active: 0, recent: 1, history: 2 };
    const byState = stateRank[a.relationshipState] - stateRank[b.relationshipState];
    if (byState !== 0) return byState;
    return timeOf(b.lastContactAt) - timeOf(a.lastContactAt);
  });
}
