const crypto = require('node:crypto');
const pool = require('../db/pool');
const HttpError = require('../utils/httpError');

function cleanTitle(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

async function getThread(userId, threadId) {
  if (!threadId) return null;
  const result = await pool.query(
    'SELECT id, user_id, title, created_at, updated_at FROM agent_threads WHERE id = $1 AND user_id = $2',
    [threadId, userId]
  );
  return result.rows[0] || null;
}

async function getOrCreateThread(userId, threadId, firstMessage = '') {
  if (threadId) {
    const existing = await getThread(userId, threadId);
    if (!existing) throw new HttpError(404, 'Agent thread not found');
    return existing;
  }

  const id = crypto.randomUUID();
  const title = cleanTitle(firstMessage) || 'New conversation';
  const result = await pool.query(
    `INSERT INTO agent_threads (id, user_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, title, created_at, updated_at`,
    [id, userId, title]
  );
  return result.rows[0];
}

async function latestThread(userId) {
  const result = await pool.query(
    `SELECT id, user_id, title, created_at, updated_at
     FROM agent_threads
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function listMessages(userId, threadId, limit = 40) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 40, 100));
  const result = await pool.query(
    `SELECT id, role, content, payload, created_at
     FROM (
       SELECT id, role, content, payload, created_at
       FROM agent_messages
       WHERE user_id = $1 AND thread_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3
     ) recent
     ORDER BY created_at ASC, id ASC`,
    [userId, threadId, safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    payload: row.payload || {},
    createdAt: row.created_at,
  }));
}

async function saveMessage({ userId, threadId, role, content, payload = {} }) {
  const result = await pool.query(
    `INSERT INTO agent_messages (thread_id, user_id, role, content, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, role, content, payload, created_at`,
    [threadId, userId, role, content, JSON.stringify(payload || {})]
  );
  await pool.query('UPDATE agent_threads SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [threadId, userId]);
  const row = result.rows[0];
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

async function createPendingAction({ userId, threadId, actionType, payload }) {
  await pool.query(
    `UPDATE agent_pending_actions
     SET status = 'cancelled'
     WHERE user_id = $1 AND thread_id = $2 AND status = 'pending'`,
    [userId, threadId]
  );

  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO agent_pending_actions (id, thread_id, user_id, action_type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, action_type, payload, status, expires_at, created_at`,
    [id, threadId, userId, actionType, JSON.stringify(payload)]
  );
  return result.rows[0];
}

async function getPendingAction(userId, actionId) {
  const result = await pool.query(
    `SELECT id, thread_id, user_id, action_type, payload, status, expires_at, created_at, confirmed_at, result
     FROM agent_pending_actions
     WHERE id = $1 AND user_id = $2`,
    [actionId, userId]
  );
  return result.rows[0] || null;
}

async function claimPendingAction(userId, actionId) {
  const result = await pool.query(
    `UPDATE agent_pending_actions
     SET status = 'executing'
     WHERE id = $1
       AND user_id = $2
       AND status = 'pending'
       AND expires_at > NOW()
     RETURNING id, thread_id, user_id, action_type, payload, status, expires_at, created_at, confirmed_at, result`,
    [actionId, userId]
  );
  return result.rows[0] || null;
}

async function markAction({ userId, actionId, status, result = null }) {
  const updated = await pool.query(
    `UPDATE agent_pending_actions
     SET status = $1,
         confirmed_at = CASE WHEN $1 = 'confirmed' THEN NOW() ELSE confirmed_at END,
         result = $2::jsonb
     WHERE id = $3 AND user_id = $4
     RETURNING id, thread_id, action_type, payload, status, expires_at, confirmed_at, result`,
    [status, result ? JSON.stringify(result) : null, actionId, userId]
  );
  return updated.rows[0] || null;
}

module.exports = {
  getThread,
  getOrCreateThread,
  latestThread,
  listMessages,
  saveMessage,
  createPendingAction,
  getPendingAction,
  claimPendingAction,
  markAction,
};
