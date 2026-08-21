const assert = require('node:assert/strict');

delete process.env.OPENAI_API_KEY;
process.env.NODE_ENV = 'test';

const { generateWorkflowArtifact, _test } = require('../src/services/workflowGenerationService');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('follow-up fallback uses persisted guest context and touch count', async () => {
  const first = await generateWorkflowArtifact({
    kind: 'follow_up',
    context: {
      bookingUrl: 'https://callsync.example/select-slot/abc',
      persistedContext: {
        attendeeName: 'Maya Chen',
        meetingType: 'Investor meeting',
        followUpCount: 0,
      },
    },
  });
  const later = _test.buildFollowUpFallback({
    bookingUrl: 'https://callsync.example/select-slot/abc',
    persistedContext: {
      attendeeName: 'Maya Chen',
      meetingType: 'Investor meeting',
      followUpCount: 2,
    },
  });

  assert.match(first.message, /Hi Maya/);
  assert.match(first.message, /https:\/\/callsync\.example\/select-slot\/abc/);
  assert.match(first.message, /just following up/i);
  assert.match(later.message, /one more quick follow-up/i);
});

test('pre-call fallback prioritizes persisted guest answers', async () => {
  const output = await generateWorkflowArtifact({
    kind: 'pre_call',
    context: {
      persistedContext: {
        meetingType: 'Investor meeting',
        meetingGoal: 'Understand fund fit and agree the next fundraising step.',
        guestAnswers: [
          { question: 'What stage?', answer: 'We focus on seed-stage infrastructure companies.' },
        ],
      },
    },
  });

  assert.equal(output.goal, 'Understand fund fit and agree the next fundraising step.');
  assert.equal(output.agenda.length <= 5, true);
  assert.equal(output.agenda.some((item) => item.includes('seed-stage infrastructure')), true);
  assert.match(output.openingPrompt, /seed-stage infrastructure/);
});

test('pre-call preparation carries forward prior same-attendee meeting memory', async () => {
  const output = await generateWorkflowArtifact({
    kind: 'pre_call',
    context: {
      persistedContext: {
        meetingType: 'Customer discovery',
        meetingGoal: 'Review progress and choose the next implementation step.',
        guestAnswers: [],
        previousMeetingMemory: {
          summary: 'The team uses a manual approval workflow and asked for a short proposal.',
          nextStep: 'Send the proposal and schedule a technical follow-up.',
        },
      },
    },
  });

  assert.equal(output.agenda.some((item) => /manual approval workflow/i.test(item)), true);
  assert.match(output.openingPrompt, /last time|manual approval workflow/i);

  const providerLikeOutput = _test.addPreCallContinuity({
    goal: 'Review progress.',
    agenda: ['Confirm today’s goal.', 'Discuss implementation options.'],
    openingPrompt: 'What changed since we last spoke?',
  }, {
    persistedContext: {
      previousMeetingMemory: { summary: 'Security review is the remaining blocker.' },
    },
  });
  assert.equal(providerLikeOutput.agenda.some((item) => /Security review is the remaining blocker/i.test(item)), true);
});

test('next-step fallback responds to meeting type and outcome draft', async () => {
  const output = await generateWorkflowArtifact({
    kind: 'next_step',
    context: {
      happened: true,
      useful: true,
      notes: 'They asked for the product deck before the partner meeting.',
      persistedContext: {
        meetingType: 'Investor meeting',
      },
    },
  });

  assert.match(output.nextStep, /requested material|investor step/i);
  assert.match(output.followUpHint, /product deck/i);
});

test('next-step fallback handles a meeting that did not happen', () => {
  const output = _test.buildNextStepFallback({
    happened: false,
    persistedContext: { meetingType: 'Customer discovery' },
  });

  assert.match(output.nextStep, /reschedul/i);
});

test('workflow normalization limits generated agenda length and text size', () => {
  const fallback = _test.buildPreCallFallback({
    persistedContext: { meetingType: 'Client kickoff', meetingGoal: 'Align scope.' },
  });
  const output = _test.normalizePreCall({
    goal: '  Better goal  ',
    agenda: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
    openingPrompt: '  Start here  ',
  }, fallback);

  assert.equal(output.goal, 'Better goal');
  assert.deepEqual(output.agenda, ['One', 'Two', 'Three', 'Four', 'Five']);
  assert.equal(output.openingPrompt, 'Start here');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }

  console.log(`${tests.length} workflow generation tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
