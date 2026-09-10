const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for LangGraph checkpoint integration tests');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const z = require('zod');
const { StateGraph, StateSchema, START, END } = require('@langchain/langgraph');
const pool = require('../src/db/pool');
const { getAgentCheckpointer, graphThreadConfig, _test } = require('../src/services/agentCheckpointService');

(async () => {
  const checkpointer = await getAgentCheckpointer();

  const schemaResult = await pool.query(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
    [_test.CHECKPOINT_SCHEMA]
  );
  assert.equal(schemaResult.rows[0]?.schema_name, 'langgraph');

  const State = new StateSchema({
    value: z.number().default(0),
    label: z.string().default(''),
  });

  const graph = new StateGraph(State)
    .addNode('increment', (state) => ({
      value: state.value + 1,
      label: 'persisted',
    }))
    .addEdge(START, 'increment')
    .addEdge('increment', END)
    .compile({ checkpointer });

  const threadId = `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = graphThreadConfig(threadId);
  const result = await graph.invoke({ value: 4, label: 'start' }, config);

  assert.equal(result.value, 5);
  assert.equal(result.label, 'persisted');

  const persisted = await checkpointer.get(config);
  assert.ok(persisted, 'expected PostgresSaver to return a checkpoint');
  assert.equal(persisted.channel_values.value, 5);
  assert.equal(persisted.channel_values.label, 'persisted');

  const state = await graph.getState(config);
  assert.equal(state.values.value, 5);
  assert.equal(state.values.label, 'persisted');

  await pool.end();
  console.log('LangGraph Postgres checkpoint integration test passed');
})().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
