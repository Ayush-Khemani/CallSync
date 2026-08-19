const assert = require('node:assert/strict');

delete process.env.OPENAI_API_KEY;
process.env.NODE_ENV = 'test';

const { generateWorkflowContent, _test } = require('../src/services/generationService');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('meeting brief fallback preserves deterministic investor workflow', async () => {
  const output = await generateWorkflowContent({
    kind: 'meeting_brief',
    context: {
      prompt: 'Set up a 30 minute investor intro with Maya Chen maya@example.com next week in the afternoon and ask about timeline.',
      now: '2026-08-19T12:00:00.000Z',
    },
  });

  assert.equal(output.brief.type, 'Investor meeting');
  assert.equal(output.formPatch.attendeeEmail, 'maya@example.com');
  assert.equal(output.formPatch.attendeeName, 'Maya Chen');
  assert.equal(output.formPatch.durationMinutes, 30);
  assert.equal(output.formPatch.workStartHour, 13);
  assert.equal(output.formPatch.workEndHour, 17);
  assert.equal(output.formPatch.selectedDate, '2026-08-26');
  assert.equal(output.brief.questions.some((question) => question.toLowerCase().includes('timeline')), true);
  assert.equal(output.brief.questions.length <= 5, true);
});

test('normalization keeps model output inside supported meeting controls', () => {
  const fallback = _test.buildMeetingBriefFallback({
    prompt: 'Create a client kickoff tomorrow',
    now: '2026-08-19T12:00:00.000Z',
  });

  const normalized = _test.normalizeMeetingBrief({
    formPatch: {
      attendeeEmail: ' guest@example.com ',
      attendeeName: ' Guest Person ',
      selectedDate: 'not-a-date',
      durationMinutes: 999,
      bufferMinutes: 999,
      slotIntervalMinutes: 7,
      workStartHour: 22,
      workEndHour: 3,
    },
    brief: {
      type: ' Client workshop ',
      goal: ' Align on launch ',
      questions: [' Q1? ', ' Q2? ', ' Q3? ', ' Q4? ', ' Q5? ', ' Q6? '],
      message: ' Pick a time. ',
    },
    insights: [' generated ', ' focused '],
  }, fallback);

  assert.equal(normalized.formPatch.attendeeEmail, 'guest@example.com');
  assert.equal(normalized.formPatch.durationMinutes, fallback.formPatch.durationMinutes);
  assert.equal(normalized.formPatch.bufferMinutes, fallback.formPatch.bufferMinutes);
  assert.equal(normalized.formPatch.slotIntervalMinutes, fallback.formPatch.slotIntervalMinutes);
  assert.equal(normalized.formPatch.workStartHour, fallback.formPatch.workStartHour);
  assert.equal(normalized.formPatch.workEndHour, fallback.formPatch.workEndHour);
  assert.equal(normalized.formPatch.selectedDate, fallback.formPatch.selectedDate);
  assert.equal(normalized.brief.questions.length, 5);
});

test('response text extraction supports raw Responses API message output', () => {
  const text = _test.extractResponseText({
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{"ok":true}' }],
    }],
  });

  assert.equal(text, '{"ok":true}');
});

test('unsupported generation kinds fail at the shared boundary', async () => {
  await assert.rejects(
    () => generateWorkflowContent({ kind: 'unknown', context: {} }),
    /Unsupported generation kind/
  );
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }

  console.log(`${tests.length} generation service tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
