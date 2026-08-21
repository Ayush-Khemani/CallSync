function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator, denominator) {
  const top = number(numerator);
  const bottom = number(denominator);
  if (!bottom) return 0;
  return Math.round((top / bottom) * 1000) / 10;
}

function deriveLifecycleMetrics(row = {}) {
  const totalCreated = number(row.total_created);
  const booked = number(row.booked);
  const pending = number(row.pending);
  const cancelled = number(row.cancelled);
  const followedUp = number(row.followed_up);
  const outcomesRecorded = number(row.outcomes_recorded);
  const outcomesRated = number(row.outcomes_rated);
  const usefulMeetings = number(row.useful_meetings);
  const followUpDue = number(row.follow_up_due);

  return {
    totalCreated,
    booked,
    pending,
    cancelled,
    followedUp,
    outcomesRecorded,
    outcomesRated,
    usefulMeetings,
    followUpDue,
    rates: {
      booking: percent(booked, totalCreated),
      followUpTouched: percent(followedUp, totalCreated),
      outcomeCapture: percent(outcomesRecorded, booked),
      usefulWhenRated: percent(usefulMeetings, outcomesRated),
    },
  };
}

module.exports = { deriveLifecycleMetrics, percent };
