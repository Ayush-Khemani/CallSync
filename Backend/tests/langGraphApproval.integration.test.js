const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for LangGraph approval integration tests');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { Command } = require('@langchain/langgraph');
const pool = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');
const { getAgentCheckpointer, graphThreadConfig } = require('../src/services/agentCheckpointService');
const { createAgentGraph } = require('../src/services/agentGraphService');
const { createPendingAction, claimPendingAction, markAction } = require('../src/services/agentStore');

function baseInput(userId, threadId) {
  return {
    providerInput: [{ role: 'user', content: 'Schedule 30 minutes with Maya on September 15' }],
    userId,
    userTimeZone: 'Europe/Budapest',
    threadId,
    round: 0,
    toolCalls: [],
    latestPayload: null,
    responseText: '',
    stopReason: '',
    approval: null,
    approvalDecision: null,
    actionResult: null,
  };
}

(async () => {
  await runMigrations();
  await pool.query('TRUNCATE TABLE agent_pending_actions, agent_messages, agent_threads, slots, meetings, users RESTART IDENTITY CASCADE');

  const userResult = await pool.query(
    'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
    ['langgraph-approval@example.com', 'test-hash']
  );
  const userId = userResult.rows[0].id;
  const threadId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO agent_threads (id, user_id, title) VALUES ($1, $2, $3)',
    [threadId, userId, 'Native approval test']
  );

  const proposal = {
    attendeeName: 'Maya Chen',
    attendeeEmail: 'maya@example.com',
    date: '2026-09-15',
    durationMinutes: 30,
    timeZone: 'Europe/Budapest',
    slots: [
      '2026-09-15T13:00:00.000Z',
      '2026-09-15T14:00:00.000Z',
    ],
    selectedSlots: ['2026-09-15T13:00:00.000Z'],
    brief: {
      type: 'Investor meeting',
      goal: 'Discuss the round',
      message: 'Pick a time that works.',
      questions: [],
    },
  };

  let providerCalls = 0;
  const checkpointer = await getAgentCheckpointer();
  const graph = createAgentGraph({
    checkpointer,
    providerCall: async () => {
      providerCalls += 1;
      if (providerCalls === 1) {
        return {
          data: {
            output: [{
              type: 'function_call',
              name: 'prepare_schedule',
              call_id: 'call-schedule',
              arguments: '{"request":"Schedule 30 minutes with Maya on September 15","timeZone":"Europe/Budapest"}',
            }],
          },
        };
      }
      return {
        data: {
          output_text: 'I found two times. Confirm before I create holds or send the invitation.',
          output: [],
        },
      };
    },
    toolExecutor: async ({ name }) => {
      assert.equal(name, 'prepare_schedule');
      return { status: 'ready', proposal };
    },
    actionExecutor: async ({ userId: executingUserId, actionId, body }) => {
      assert.equal(executingUserId, userId);
      assert.deepEqual(body.selectedSlots, ['2026-09-15T14:00:00.000Z']);
      await markAction({
        userId,
        actionId,
        status: 'confirmed',
        result: { test: true },
      });
      return {
        execution: {
          content: 'Done. The approved action executed.',
          payload: { type: 'created', actionId, completed: true, meetingName: 'Maya Chen', sent: true },
          result: { test: true },
        },
      };
    },
  });

  const config = graphThreadConfig(threadId);
  const paused = await graph.invoke(baseInput(userId, threadId), config);
  assert.equal(providerCalls, 2);
  assert.ok(Array.isArray(paused.__interrupt__), 'expected graph to return a LangGraph interrupt');
  assert.equal(paused.__interrupt__.length, 1);

  const interruptValue = paused.__interrupt__[0].value;
  assert.equal(interruptValue.type, 'agent_action_approval');
  assert.equal(interruptValue.payload.type, 'schedule_confirmation');
  assert.equal(interruptValue.payload.proposal.attendeeEmail, 'maya@example.com');
  assert.equal(typeof interruptValue.actionId, 'string');

  const pending = await pool.query(
    'SELECT id, status, payload FROM agent_pending_actions WHERE id = $1 AND user_id = $2',
    [interruptValue.actionId, userId]
  );
  assert.equal(pending.rows.length, 1);
  assert.equal(pending.rows[0].status, 'pending');
  assert.equal(pending.rows[0].payload.__graphManaged, true);

  const checkpointBeforeResume = await graph.getState(config);
  assert.equal(checkpointBeforeResume.values.approval.actionId, interruptValue.actionId);
  assert.ok(checkpointBeforeResume.next.includes('await_approval'));

  const resumed = await graph.invoke(new Command({
    resume: {
      approved: true,
      actionId: interruptValue.actionId,
      body: { selectedSlots: ['2026-09-15T14:00:00.000Z'] },
    },
  }), config);

  assert.equal(resumed.responseText, 'Done. The approved action executed.');
  assert.equal(resumed.latestPayload.type, 'created');
  assert.equal(resumed.latestPayload.completed, true);
  assert.deepEqual(resumed.actionResult, { test: true });
  assert.equal(resumed.__interrupt__, undefined);

  const completed = await pool.query(
    'SELECT status, result FROM agent_pending_actions WHERE id = $1',
    [interruptValue.actionId]
  );
  assert.equal(completed.rows[0].status, 'confirmed');
  assert.deepEqual(completed.rows[0].result, { test: true });

  const finalState = await graph.getState(config);
  assert.equal(finalState.values.approval, null);
  assert.deepEqual(finalState.next, []);

  const claimThreadId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO agent_threads (id, user_id, title) VALUES ($1, $2, $3)',
    [claimThreadId, userId, 'Atomic claim test']
  );
  const claimAction = await createPendingAction({
    userId,
    threadId: claimThreadId,
    actionType: 'cancel_meeting',
    payload: { meetingId: 99 },
  });
  const firstClaim = await claimPendingAction(userId, claimAction.id);
  const secondClaim = await claimPendingAction(userId, claimAction.id);
  assert.equal(firstClaim.status, 'executing');
  assert.equal(secondClaim, null);
  await markAction({ userId, actionId: claimAction.id, status: 'failed', result: { test: 'cleanup' } });

  await pool.end();
  console.log('LangGraph native approval interrupt/resume integration test passed');
})().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
