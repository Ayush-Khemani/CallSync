const assert = require('node:assert/strict');

const { deriveLifecycleMetrics, percent } = require('../src/services/analyticsService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('percentage helper handles empty denominators safely', () => {
  assert.equal(percent(4, 8), 50);
  assert.equal(percent(1, 3), 33.3);
  assert.equal(percent(0, 0), 0);
});

test('lifecycle metrics derive transparent booking follow-up and outcome rates', () => {
  const metrics = deriveLifecycleMetrics({
    total_created: 10,
    booked: 6,
    pending: 3,
    cancelled: 1,
    followed_up: 4,
    outcomes_recorded: 3,
    outcomes_rated: 2,
    useful_meetings: 1,
    follow_up_due: 2,
  });

  assert.deepEqual(metrics, {
    totalCreated: 10,
    booked: 6,
    pending: 3,
    cancelled: 1,
    followedUp: 4,
    outcomesRecorded: 3,
    outcomesRated: 2,
    usefulMeetings: 1,
    followUpDue: 2,
    rates: {
      booking: 60,
      followUpTouched: 40,
      outcomeCapture: 50,
      usefulWhenRated: 50,
    },
  });
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} analytics service tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
