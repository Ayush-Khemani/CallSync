const { PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres');
const pool = require('../db/pool');

const CHECKPOINT_SCHEMA = 'langgraph';

let checkpointer;
let setupPromise;

async function setupCheckpointer() {
  const database = pool.getPool();
  await database.query(`CREATE SCHEMA IF NOT EXISTS ${CHECKPOINT_SCHEMA}`);

  if (!checkpointer) {
    checkpointer = new PostgresSaver(database, undefined, {
      schema: CHECKPOINT_SCHEMA,
    });
  }

  await checkpointer.setup();
  return checkpointer;
}

async function getAgentCheckpointer() {
  if (!setupPromise) {
    setupPromise = setupCheckpointer().catch((error) => {
      setupPromise = null;
      checkpointer = null;
      throw error;
    });
  }
  return setupPromise;
}

function graphThreadConfig(threadId) {
  if (typeof threadId !== 'string' || !threadId.trim()) {
    throw new Error('LangGraph thread ID is required');
  }
  const normalized = threadId.trim();
  if (normalized.length > 255) {
    throw new Error('LangGraph thread ID must be 255 characters or fewer');
  }
  return {
    configurable: {
      thread_id: normalized,
      checkpoint_ns: '',
    },
  };
}

module.exports = {
  getAgentCheckpointer,
  graphThreadConfig,
  _test: { CHECKPOINT_SCHEMA },
};
