function trimText(value, max = 180) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function meetingTypeKey(meeting) {
  return String(meeting.meetingType || '').toLowerCase();
}

export function buildPreCallBrief(meeting) {
  const answers = Array.isArray(meeting.guestAnswers)
    ? meeting.guestAnswers.filter((item) => item && String(item.answer || '').trim())
    : [];
  const goal = trimText(meeting.meetingGoal, 260) || 'Leave the call with a clear decision and next step.';
  const type = meetingTypeKey(meeting);

  let middle = 'Explore the guest context and the main problem behind this conversation.';
  let close = 'Agree the next step, owner, and timing before ending the call.';

  if (type.includes('investor')) {
    middle = 'Test fit: thesis, stage, current interest, and the highest-value fundraising question.';
    close = 'Leave with a clear investor next step: materials, partner intro, diligence, or a defined no.';
  } else if (type.includes('candidate') || type.includes('recruit')) {
    middle = 'Validate role fit, motivation, availability, and the strongest evidence from past work.';
    close = 'Set expectations for the next interview step, owner, and timeline.';
  } else if (type.includes('client') || type.includes('kickoff')) {
    middle = 'Align scope, stakeholders, constraints, success criteria, and immediate delivery risks.';
    close = 'Confirm ownership, first deliverable, and the next client checkpoint.';
  } else if (type.includes('customer') || type.includes('discovery') || type.includes('sales')) {
    middle = 'Understand the current workflow, pain, urgency, decision process, and cost of doing nothing.';
    close = 'Decide whether there is a real fit and define the next commercial step.';
  }

  const contextAgenda = answers.slice(0, 2).map((item) => `Use guest context: ${trimText(item.answer, 150)}`);
  const agenda = [
    `Open by confirming the goal: ${goal}`,
    ...contextAgenda,
    middle,
    close,
  ].slice(0, 5);

  const strongestAnswer = answers[0]?.answer;
  const openingPrompt = strongestAnswer
    ? `“Thanks for sharing that context beforehand. You mentioned ${trimText(strongestAnswer, 130)}. Can you walk me through what matters most there?”`
    : `“Before we jump in, I want to make sure we use the time well. The goal I have for this call is: ${trimText(goal, 150)}. What would make this conversation useful for you?”`;

  return {
    goal,
    agenda,
    openingPrompt,
    guestContextCount: answers.length,
  };
}

export function getMeetingNextAction(meeting, now = Date.now()) {
  if (meeting.status !== 'confirmed') return { id: 'none', label: 'No booked-call action', priority: 9 };

  const selectedTime = meeting.selectedSlot ? new Date(meeting.selectedSlot).getTime() : null;
  const followUpTime = meeting.followUpAt ? new Date(meeting.followUpAt).getTime() : null;
  const hasOutcome = Boolean(meeting.recordedAt);

  if (followUpTime && followUpTime <= now) {
    return { id: 'nextAction', label: 'Next action due', priority: 0 };
  }
  if (selectedTime && selectedTime < now && !hasOutcome) {
    return { id: 'outcomeDue', label: 'Outcome due', priority: 1 };
  }
  if (selectedTime && selectedTime >= now) {
    return { id: 'prepare', label: 'Prepare', priority: 2 };
  }
  if (followUpTime && followUpTime > now) {
    return { id: 'scheduled', label: 'Next action scheduled', priority: 3 };
  }
  if (hasOutcome) {
    return { id: 'captured', label: 'Outcome captured', priority: 4 };
  }
  return { id: 'none', label: 'No next action', priority: 8 };
}

export function filterBookedMeetings(meetings, filter) {
  const booked = meetings.filter((meeting) => meeting.status === 'confirmed');
  if (!filter || filter === 'all') return booked;
  return booked.filter((meeting) => getMeetingNextAction(meeting).id === filter);
}

export function sortByNextAction(meetings) {
  return [...meetings].sort((a, b) => {
    const actionA = getMeetingNextAction(a);
    const actionB = getMeetingNextAction(b);
    if (actionA.priority !== actionB.priority) return actionA.priority - actionB.priority;
    const aTime = a.selectedSlot ? new Date(a.selectedSlot).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.selectedSlot ? new Date(b.selectedSlot).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}
