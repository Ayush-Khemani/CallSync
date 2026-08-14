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

function generateAvailableSlots(events, date, options = {}) {
  const window = getAvailabilityWindow(date, options);
  const slots = [];

  if (!window) {
    return slots;
  }

  const {
    slotMinutes,
    slotIntervalMinutes,
    bufferMinutes,
  } = window.options;
  const durationMs = slotMinutes * 60000;
  const intervalMs = slotIntervalMinutes * 60000;
  const bufferMs = bufferMinutes * 60000;
  const busyRanges = events
    .map(getEventRange)
    .filter((range) => !Number.isNaN(range.start.getTime()) && !Number.isNaN(range.end.getTime()))
    .map((range) => ({
      start: new Date(range.start.getTime() - bufferMs),
      end: new Date(range.end.getTime() + bufferMs),
    }));

  for (
    let slotStart = new Date(window.start);
    slotStart.getTime() + durationMs <= window.end.getTime();
    slotStart = new Date(slotStart.getTime() + intervalMs)
  ) {
    const slotEnd = new Date(slotStart.getTime() + durationMs);
    const isBooked = busyRanges.some((range) => slotStart < range.end && slotEnd > range.start);

    if (!isBooked) {
      slots.push(slotStart.toISOString());
    }
  }

  return slots;
}

module.exports = { generateAvailableSlots, getAvailabilityWindow };
