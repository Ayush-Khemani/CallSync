const assert = require('node:assert/strict');

delete process.env.OPENAI_API_KEY;
process.env.NODE_ENV = 'test';

const { generateMeetingMemory, _test } = require('../src/services/memoryGenerationService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('memory fallback derives only from captured notes and persisted outcome context', async () => {
  const output = await generateMeetingMemory({
    notes: [
      'The buyer described a manual approvals workflow.',
      'We agreed to send a short proposal on Friday.',
      'Action: schedule a technical follow-up with the CTO.',
      'Can their security team join the next call?',
    ].join('\n'),
    persistedContext: {
      meetingGoal: 'Understand the buyer workflow.',
      outcomeNotes: 'The buyer wants a clearer implementation plan.',
    },
  });

  assert.match(output.summary, /manual approvals workflow/i);
  assert.equal(output.decisions.some((item) => /agreed to send/i.test(item)), true);
  assert.equal(output.actionItems.some((item) => /schedule a technical follow-up/i.test(item.task)), true);
  assert.equal(output.unansweredQuestions.some((item) => /security team/i.test(item)), true);
  assert.equal(output.actionItems.every((item) => item.owner === '' && item.dueAt === ''), true);
});

test('memory fallback does not invent content when notes are empty', () => {
  const output = _test.buildMemoryFallback({
    notes: '',
    persistedContext: {
      meetingGoal: 'Confirm whether there is a real integration need.',
    },
  });

  assert.match(output.summary, /Confirm whether there is a real integration need/);
  assert.deepEqual(output.decisions, []);
  assert.deepEqual(output.actionItems, []);
  assert.deepEqual(output.unansweredQuestions, []);
});

test('memory normalization keeps action owners and due dates only when supplied', () => {
  const fallback = _test.buildMemoryFallback({ notes: 'Action: send the deck.' });
  const normalized = _test.normalizeMemory({
    summary: '  Clear summary.  ',
    keyPoints: ['One', 'One', 'Two'],
    decisions: ['Proceed with a pilot.'],
    actionItems: [
      { task: 'Send the deck', owner: 'Ayush', dueAt: '2026-09-20' },
      { task: '', owner: 'Nobody', dueAt: 'tomorrow' },
    ],
    unansweredQuestions: ['Who owns procurement?'],
  }, fallback);

  assert.equal(normalized.summary, 'Clear summary.');
  assert.deepEqual(normalized.keyPoints, ['One', 'Two']);
  assert.deepEqual(normalized.actionItems, [{ task: 'Send the deck', owner: 'Ayush', dueAt: '2026-09-20' }]);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} meeting memory generation tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
