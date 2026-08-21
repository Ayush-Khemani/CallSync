const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { analyzeAvailability } = require('../src/services/availabilityService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('slot ranking prefers well-spaced central work-window options', () => {
  const result = analyzeAvailability({}, '2026-09-01', {
    timeZone: 'UTC',
    workStartHour: 9,
    workEndHour: 17,
    durationMinutes: 60,
    slotIntervalMinutes: 60,
    bufferMinutes: 0,
  });

  assert.equal(result.availableSlots.length, 8);
  assert.equal(result.rankedSlots[0].time, '2026-09-01T12:00:00.000Z');
  assert.equal(result.rankedSlots[1].time, '2026-09-01T13:00:00.000Z');
  assert.equal(result.rankedSlots[0].score > result.rankedSlots.at(-1).score, true);
  assert.equal(result.rankedSlots[0].reasons.includes('Centered in your work window'), true);
});

test('conflict summary counts providers without returning private event content', () => {
  const result = analyzeAvailability({
    google: [{
      summary: 'Private board discussion',
      description: 'Confidential acquisition details',
      attendees: [{ email: 'secret@example.com' }],
      start: { dateTime: '2026-09-01T10:00:00.000Z' },
      end: { dateTime: '2026-09-01T11:00:00.000Z' },
    }],
    outlook: [{
      subject: 'Private medical appointment',
      body: { content: 'Sensitive details' },
      start: { dateTime: '2026-09-01T11:00:00.000Z' },
      end: { dateTime: '2026-09-01T12:00:00.000Z' },
    }],
  }, '2026-09-01', {
    timeZone: 'UTC',
    workStartHour: 9,
    workEndHour: 13,
    durationMinutes: 60,
    slotIntervalMinutes: 60,
  });

  assert.deepEqual(result.conflictSummary, {
    candidateSlots: 4,
    availableSlots: 2,
    blockedSlots: 2,
    blockedBy: { google: 1, outlook: 1, both: 0 },
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Private board discussion'), false);
  assert.equal(serialized.includes('Confidential acquisition details'), false);
  assert.equal(serialized.includes('secret@example.com'), false);
  assert.equal(serialized.includes('Private medical appointment'), false);
  assert.equal(serialized.includes('Sensitive details'), false);
});

test('buffer time can block an adjacent candidate without exposing why', () => {
  const result = analyzeAvailability({
    google: [{
      start: { dateTime: '2026-09-01T11:00:00.000Z' },
      end: { dateTime: '2026-09-01T12:00:00.000Z' },
    }],
  }, '2026-09-01', {
    timeZone: 'UTC',
    workStartHour: 9,
    workEndHour: 14,
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    bufferMinutes: 15,
  });

  assert.equal(result.availableSlots.includes('2026-09-01T10:30:00.000Z'), false);
  assert.equal(result.availableSlots.includes('2026-09-01T12:00:00.000Z'), false);
  assert.equal(result.conflictSummary.blockedBy.google > 0, true);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} availability intelligence tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
