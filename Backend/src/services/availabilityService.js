const DEFAULT_WORK_START_HOUR = 9;
const DEFAULT_WORK_END_HOUR = 17;
const DEFAULT_SLOT_MINUTES = 60;
const DEFAULT_SLOT_INTERVAL_MINUTES = 30;
const DEFAULT_BUFFER_MINUTES = 0;
const DEFAULT_TIME_ZONE = 'UTC';

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeOptions(options = {}) {
  return {
    workStartHour: toNonNegativeInteger(options.workStartHour, DEFAULT_WORK_START_HOUR),
    workEndHour: toPositiveInteger(options.workEndHour, DEFAULT_WORK_END_HOUR),
    slotMinutes: toPositiveInteger(options.slotMinutes || options.durationMinutes, DEFAULT_SLOT_MINUTES),
    slotIntervalMinutes: toPositiveInteger(options.slotIntervalMinutes, DEFAULT_SLOT_INTERVAL_MINUTES),
    bufferMinutes: toNonNegativeInteger(options.bufferMinutes, DEFAULT_BUFFER_MINUTES),
    timeZone: options.timeZone || DEFAULT_TIME_ZONE,
  };
}

function getEventRange(event) {
  return {
    start: new Date(event.start?.dateTime || event.start?.date),
    end: new Date(event.end?.dateTime || event.end?.date),
  };
}

function getDateText(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function zonedDateTimeToUtc(dateText, hour, minute, timeZone) {
  const [year, month, day] = dateText.split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(targetUtc);
  const actual = getZonedParts(guess, timeZone);
  const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour % 24, actual.minute);

  return new Date(targetUtc + (targetUtc - actualUtc));
}

function getAvailabilityWindow(date, options = {}) {
  const normalized = normalizeOptions(options);
  const dateText = getDateText(date);
  if (!dateText || normalized.workEndHour <= normalized.workStartHour) {
    return null;
  }

  return {
    start: zonedDateTimeToUtc(dateText, normalized.workStartHour, 0, normalized.timeZone),
    end: zonedDateTimeToUtc(dateText, normalized.workEndHour, 0, normalized.timeZone),
    options: normalized,
  };
}

function buildBusyRanges(events = [], bufferMs = 0) {
  return events
    .map(getEventRange)
    .filter((range) => !Number.isNaN(range.start.getTime()) && !Number.isNaN(range.end.getTime()))
    .map((range) => ({
      start: new Date(range.start.getTime() - bufferMs),
      end: new Date(range.end.getTime() + bufferMs),
    }));
}

function overlaps(slotStart, slotEnd, ranges) {
  return ranges.some((range) => slotStart < range.end && slotEnd > range.start);
}

function generateCandidateSlots(window) {
  const slots = [];
  if (!window) return slots;

  const durationMs = window.options.slotMinutes * 60000;
  const intervalMs = window.options.slotIntervalMinutes * 60000;
  for (
    let slotStart = new Date(window.start);
    slotStart.getTime() + durationMs <= window.end.getTime();
    slotStart = new Date(slotStart.getTime() + intervalMs)
  ) {
    slots.push({
      start: new Date(slotStart),
      end: new Date(slotStart.getTime() + durationMs),
    });
  }
  return slots;
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function nearestClearanceMinutes(slot, ranges, window) {
  let before = minutesBetween(window.start, slot.start);
  let after = minutesBetween(slot.end, window.end);

  for (const range of ranges) {
    if (range.end <= slot.start) {
      before = Math.min(before, minutesBetween(range.end, slot.start));
    }
    if (range.start >= slot.end) {
      after = Math.min(after, minutesBetween(slot.end, range.start));
    }
  }

  return { before, after };
}

function scoreAvailableSlot(slot, allRanges, window) {
  const workMidpoint = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const slotMidpoint = new Date((slot.start.getTime() + slot.end.getTime()) / 2);
  const halfWindowMinutes = Math.max(1, minutesBetween(window.start, workMidpoint));
  const midpointDistance = Math.abs(slotMidpoint.getTime() - workMidpoint.getTime()) / 60000;
  const centerScore = Math.max(0, 40 - Math.round((midpointDistance / halfWindowMinutes) * 40));

  const edgeClearance = Math.min(
    minutesBetween(window.start, slot.start),
    minutesBetween(slot.end, window.end)
  );
  const edgeScore = Math.min(25, Math.round((edgeClearance / 120) * 25));

  const clearance = nearestClearanceMinutes(slot, allRanges, window);
  const surroundingClearance = Math.min(clearance.before, clearance.after);
  const clearanceScore = Math.min(25, Math.round((surroundingClearance / 120) * 25));

  const startHour = getZonedParts(slot.start, window.options.timeZone).hour % 24;
  const coreHoursScore = startHour >= 10 && startHour < 16 ? 10 : 5;
  const score = centerScore + edgeScore + clearanceScore + coreHoursScore;

  const reasons = [];
  if (midpointDistance <= 90) reasons.push('Centered in your work window');
  if (surroundingClearance >= 60) reasons.push('Comfortable space around this slot');
  if (startHour >= 10 && startHour < 16) reasons.push('Inside core working hours');
  if (!reasons.length) reasons.push('Available across connected calendars');

  return { score, reasons: reasons.slice(0, 2) };
}

function analyzeAvailability(calendarEvents = {}, date, options = {}) {
  const window = getAvailabilityWindow(date, options);
  if (!window) {
    return {
      availableSlots: [],
      rankedSlots: [],
      conflictSummary: {
        candidateSlots: 0,
        availableSlots: 0,
        blockedSlots: 0,
        blockedBy: { google: 0, outlook: 0, both: 0 },
      },
    };
  }

  const bufferMs = window.options.bufferMinutes * 60000;
  const googleRanges = buildBusyRanges(calendarEvents.google || [], bufferMs);
  const outlookRanges = buildBusyRanges(calendarEvents.outlook || [], bufferMs);
  const allRanges = [...googleRanges, ...outlookRanges];
  const candidates = generateCandidateSlots(window);
  const blockedBy = { google: 0, outlook: 0, both: 0 };
  const available = [];

  for (const slot of candidates) {
    const googleBlocked = overlaps(slot.start, slot.end, googleRanges);
    const outlookBlocked = overlaps(slot.start, slot.end, outlookRanges);
    if (googleBlocked || outlookBlocked) {
      if (googleBlocked) blockedBy.google += 1;
      if (outlookBlocked) blockedBy.outlook += 1;
      if (googleBlocked && outlookBlocked) blockedBy.both += 1;
      continue;
    }

    const ranking = scoreAvailableSlot(slot, allRanges, window);
    available.push({
      time: slot.start.toISOString(),
      score: ranking.score,
      reasons: ranking.reasons,
    });
  }

  available.sort((left, right) => right.score - left.score || left.time.localeCompare(right.time));

  return {
    availableSlots: available.map((slot) => slot.time),
    rankedSlots: available,
    conflictSummary: {
      candidateSlots: candidates.length,
      availableSlots: available.length,
      blockedSlots: candidates.length - available.length,
      blockedBy,
    },
  };
}

function generateAvailableSlots(events, date, options = {}) {
  const window = getAvailabilityWindow(date, options);
  const slots = [];

  if (!window) {
    return slots;
  }

  const bufferMs = window.options.bufferMinutes * 60000;
  const busyRanges = buildBusyRanges(events, bufferMs);

  for (const slot of generateCandidateSlots(window)) {
    if (!overlaps(slot.start, slot.end, busyRanges)) {
      slots.push(slot.start.toISOString());
    }
  }

  return slots;
}

module.exports = {
  generateAvailableSlots,
  analyzeAvailability,
  getAvailabilityWindow,
  _test: {
    buildBusyRanges,
    generateCandidateSlots,
    scoreAvailableSlot,
    nearestClearanceMinutes,
  },
};
