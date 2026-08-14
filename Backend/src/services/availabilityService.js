const DEFAULT_WORK_START_HOUR = 9;
const DEFAULT_WORK_END_HOUR = 17;
const DEFAULT_SLOT_MINUTES = 60;

function getEventRange(event) {
  return {
    start: new Date(event.start?.dateTime || event.start?.date),
    end: new Date(event.end?.dateTime || event.end?.date),
  };
}

function generateAvailableSlots(events, date, options = {}) {
  const workStartHour = options.workStartHour || DEFAULT_WORK_START_HOUR;
  const workEndHour = options.workEndHour || DEFAULT_WORK_END_HOUR;
  const slotMinutes = options.slotMinutes || DEFAULT_SLOT_MINUTES;
  const slots = [];
  const dayStart = new Date(date);

  if (Number.isNaN(dayStart.getTime())) {
    return slots;
  }

  dayStart.setHours(workStartHour, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(workEndHour, 0, 0, 0);

  for (
    let slotStart = new Date(dayStart);
    slotStart < dayEnd;
    slotStart = new Date(slotStart.getTime() + slotMinutes * 60000)
  ) {
    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);
    const isBooked = events.some((event) => {
      const eventRange = getEventRange(event);
      return slotStart < eventRange.end && slotEnd > eventRange.start;
    });

    if (!isBooked) {
      slots.push(slotStart.toISOString());
    }
  }

  return slots;
}

module.exports = { generateAvailableSlots };
