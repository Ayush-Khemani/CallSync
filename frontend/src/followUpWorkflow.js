const DAY_MS = 24 * 60 * 60 * 1000;

function asTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function defaultDueTime(meeting) {
  const lastFollowUp = asTime(meeting.lastFollowedUpAt);
  const created = asTime(meeting.createdAt);
  const anchor = lastFollowUp || created || Date.now();
  return anchor + (lastFollowUp ? 3 : 2) * DAY_MS;
}

export function getFollowUpRisk(meeting, now = Date.now()) {
  if (meeting.status === 'confirmed'
    && (meeting.confirmationAttendeeEmailSentAt === null || meeting.confirmationHostEmailSentAt === null)) {
    return {
      level: 'medium',
      label: 'Confirmation delivery unconfirmed',
      detail: 'The meeting is booked on the calendar, but one or more confirmation emails were not verified as sent. Check the guest/host inboxes before relying on email delivery.',
    };
  }

  if (meeting.status !== 'pending') {
    return {
      level: 'none',
      label: 'No follow-up needed',
      detail: 'This meeting is no longer waiting on a guest.',
    };
  }

  if (meeting.requestEmailSentAt === null) {
    return {
      level: 'high',
      label: 'Email delivery unconfirmed',
      detail: 'CallSync could not confirm the request email was sent. Copy the booking link and send it to the guest manually.',
    };
  }

  const dueAt = asTime(meeting.nextFollowUpAt) || defaultDueTime(meeting);
  const delta = now - dueAt;

  if (delta >= 2 * DAY_MS) {
    const overdueDays = Math.max(2, Math.floor(delta / DAY_MS));
    return {
      level: 'high',
      label: 'High follow-up risk',
      detail: `${overdueDays} days overdue. Send a personal nudge today.`,
    };
  }

  if (delta >= 0) {
    const count = Number(meeting.followUpCount || 0);
    return {
      level: 'medium',
      label: count ? 'Follow-up due again' : 'Follow-up due',
      detail: count
        ? `You followed up ${count} time${count === 1 ? '' : 's'} already. This request needs another touch.`
        : 'The guest has had enough time to respond. Keep the invite from going cold.',
    };
  }

  const daysUntil = Math.max(1, Math.ceil(Math.abs(delta) / DAY_MS));
  return {
    level: 'low',
    label: 'Healthy invite',
    detail: meeting.lastFollowedUpAt
      ? `Follow-up recorded. Check again in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`
      : `No action needed yet. Follow up in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
  };
}

export function needsFollowUp(meeting) {
  return meeting.status === 'pending' && ['medium', 'high'].includes(getFollowUpRisk(meeting).level);
}

export function getMeetingPipelineStages(meetings) {
  return [
    { id: 'followUp', label: 'Needs follow-up', meetings: meetings.filter(needsFollowUp) },
    { id: 'pending', label: 'Link sent', meetings: meetings.filter((meeting) => meeting.status === 'pending' && !needsFollowUp(meeting)) },
    { id: 'confirmed', label: 'Booked', meetings: meetings.filter((meeting) => meeting.status === 'confirmed') },
    { id: 'cancelled', label: 'Closed', meetings: meetings.filter((meeting) => meeting.status === 'cancelled') },
  ];
}

export function buildFollowUpMessage(meeting, bookingUrl) {
  const firstName = (meeting.attendeeName || '').trim().split(/\s+/)[0] || 'there';
  const meetingType = (meeting.meetingType || 'meeting').trim().toLowerCase();
  const touch = Number(meeting.followUpCount || 0);

  if (touch > 0) {
    return `Hi ${firstName} — one more quick follow-up on our ${meetingType}. If you'd still like to connect, you can pick a time here: ${bookingUrl}. If the timing isn't right, no worries.`;
  }

  return `Hi ${firstName} — just following up on our ${meetingType}. Here's the booking link again in case it got buried: ${bookingUrl}. Happy to find another time if none of these work.`;
}

export function getFollowUpMeta(meeting) {
  const count = Number(meeting.followUpCount || 0);
  return {
    count,
    lastLabel: meeting.lastFollowedUpAt ? new Date(meeting.lastFollowedUpAt).toLocaleString() : 'Not yet',
    nextLabel: meeting.nextFollowUpAt ? new Date(meeting.nextFollowUpAt).toLocaleString() : 'Not scheduled',
  };
}
